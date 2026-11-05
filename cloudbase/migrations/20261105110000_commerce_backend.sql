CREATE TABLE public.commerce_users (
 id uuid PRIMARY KEY, username text NOT NULL UNIQUE, salt text NOT NULL,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.commerce_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.commerce_users(id),
 csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX commerce_sessions_owner ON public.commerce_sessions(user_id);
CREATE TABLE public.commerce_throttle (key_hash text PRIMARY KEY, attempts integer NOT NULL, until_at timestamptz NOT NULL);
CREATE TABLE public.commerce_orders (
 id uuid PRIMARY KEY, owner_id uuid REFERENCES public.commerce_users(id),
 request_id text, request_hash text NOT NULL, status text NOT NULL,
 total_fen integer NOT NULL CHECK(total_fen>=0), created_at timestamptz NOT NULL,
 payload jsonb NOT NULL, archived boolean NOT NULL DEFAULT false,
 UNIQUE(owner_id,request_id)
);
CREATE INDEX commerce_orders_owner ON public.commerce_orders(owner_id,created_at DESC);
CREATE TABLE public.commerce_order_items (
 order_id uuid NOT NULL REFERENCES public.commerce_orders(id), line_number integer NOT NULL,
 product_type text NOT NULL, variant text, quantity integer NOT NULL CHECK(quantity>0),
 payload jsonb NOT NULL, PRIMARY KEY(order_id,line_number)
);
CREATE TABLE public.commerce_legacy_batches (id uuid PRIMARY KEY,payload jsonb NOT NULL);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['commerce_users','commerce_sessions','commerce_throttle','commerce_orders','commerce_order_items','commerce_legacy_batches'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
 END LOOP;
END $$;

-- Only the trusted backend can execute this transactional RPC. No arbitrary SQL.
CREATE FUNCTION public.commerce_command(op text,args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE u commerce_users; s commerce_sessions; o commerce_orders; t commerce_throttle;
 result jsonb; item jsonb; i integer; changed integer;
BEGIN
 IF op='throttle' THEN
  INSERT INTO commerce_throttle VALUES(args->>'key',1,now()+make_interval(secs=>(args->>'period')::integer))
  ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN commerce_throttle.until_at<=now() THEN 1 ELSE commerce_throttle.attempts+1 END,
   until_at=CASE WHEN commerce_throttle.until_at<=now() THEN excluded.until_at ELSE commerce_throttle.until_at END RETURNING * INTO t;
  RETURN jsonb_build_object('allowed',t.attempts<=(args->>'max')::integer);
 ELSIF op='register' THEN
  INSERT INTO commerce_users(id,username,salt,password_hash) VALUES((args->>'id')::uuid,args->>'username',args->>'salt',args->>'passwordHash') RETURNING * INTO u;
  RETURN jsonb_build_object('id',u.id,'username',u.username,'createdAt',u.created_at);
 ELSIF op='user' THEN
  SELECT * INTO u FROM commerce_users WHERE username=args->>'username'; RETURN to_jsonb(u);
 ELSIF op='session_create' THEN
  INSERT INTO commerce_sessions VALUES(args->>'hash',(args->>'userId')::uuid,args->>'csrf',now()+interval '7 days');
  DELETE FROM commerce_sessions WHERE expires_at<now();
  RETURN '{}'::jsonb;
 ELSIF op='session_get' THEN
  SELECT * INTO s FROM commerce_sessions WHERE token_hash=args->>'hash' AND expires_at>now();
  IF s.user_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO u FROM commerce_users WHERE id=s.user_id;
  RETURN jsonb_build_object('user',jsonb_build_object('id',u.id,'username',u.username,'createdAt',u.created_at),'csrf',s.csrf);
 ELSIF op='logout' THEN
  DELETE FROM commerce_sessions WHERE token_hash=args->>'hash'; RETURN '{}'::jsonb;
 ELSIF op='password' THEN
  UPDATE commerce_users SET salt=args->>'salt',password_hash=args->>'passwordHash' WHERE id=(args->>'userId')::uuid AND password_hash=args->>'oldHash';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RETURN jsonb_build_object('conflict',true); END IF;
  DELETE FROM commerce_sessions WHERE user_id=(args->>'userId')::uuid;
  RETURN '{}'::jsonb;
 ELSIF op='orders_list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'status',q.status,'createdAt',q.created_at,'totalFen',q.total_fen,'items',q.payload#>'{draft,items}','tracking',q.payload->'tracking') ORDER BY q.created_at DESC),'[]'::jsonb) INTO result
  FROM (SELECT * FROM commerce_orders WHERE owner_id=(args->>'userId')::uuid AND NOT archived ORDER BY created_at DESC LIMIT 100 OFFSET coalesce((args->>'offset')::integer,0)) q;
  RETURN result;
 ELSIF op='order_get' THEN
  SELECT * INTO o FROM commerce_orders WHERE id=(args->>'id')::uuid AND owner_id=(args->>'userId')::uuid AND NOT archived; RETURN o.payload;
 ELSIF op='order_create' THEN
  -- Serialize concurrent submissions of the same account+request id.
  PERFORM pg_advisory_xact_lock(hashtextextended((args->>'userId')||':'||(args->>'requestId'),0));
  SELECT * INTO o FROM commerce_orders WHERE owner_id=(args->>'userId')::uuid AND request_id=args->>'requestId';
  IF o.id IS NOT NULL THEN
   IF o.request_hash<>args->>'requestHash' THEN RETURN jsonb_build_object('conflict',true); END IF; RETURN o.payload;
  END IF;
  result=args->'order';
  INSERT INTO commerce_orders VALUES((result->>'id')::uuid,(args->>'userId')::uuid,args->>'requestId',args->>'requestHash',result->>'status',(result#>>'{draft,quote,totalFen}')::integer,(result->>'createdAt')::timestamptz,result,false);
  i=0; FOR item IN SELECT value FROM jsonb_array_elements(result#>'{draft,items}') LOOP
   INSERT INTO commerce_order_items VALUES((result->>'id')::uuid,i,item->>'type',item->>'variant',(item->>'quantity')::integer,item); i=i+1;
  END LOOP; RETURN result;
 ELSIF op='order_action' THEN
  SELECT * INTO o FROM commerce_orders WHERE id=(args->>'id')::uuid AND owner_id=(args->>'userId')::uuid AND NOT archived FOR UPDATE;
  IF o.id IS NULL THEN RETURN NULL; END IF;
  IF (args->>'action'='cancel' AND o.status='cancelled') OR (args->>'action'='complete' AND o.status='completed') THEN RETURN o.payload; END IF;
  IF NOT ((args->>'action'='cancel' AND o.status='pending_payment') OR (args->>'action'='complete' AND o.status='shipped')) THEN RETURN jsonb_build_object('conflict',true); END IF;
  o.status=CASE WHEN args->>'action'='cancel' THEN 'cancelled' ELSE 'completed' END;
  result=jsonb_set(o.payload,'{status}',to_jsonb(o.status));
  result=jsonb_set(result,'{events}',coalesce(result->'events','[]'::jsonb)||jsonb_build_array(jsonb_build_object('status',o.status,'at',now(),'actor','customer')));
  UPDATE commerce_orders SET status=o.status,payload=result WHERE id=o.id; RETURN result;
 END IF;
 RAISE EXCEPTION 'unsupported operation';
END $$;
REVOKE ALL ON FUNCTION public.commerce_command(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_command(text,jsonb) TO service_role;
