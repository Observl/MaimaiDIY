import config from './playwright.config.js';
export default {...config,testMatch:'orders.spec.js',testIgnore:[],webServer:{command:'node server/commerce-demo.mjs',url:'http://127.0.0.1:9426',env:{ORDER_PORT:'9426',ORDER_DATA_SUBDIR:'commerce-test',ORDER_ADMIN_TOKEN:'local-browser-test-admin-only'},reuseExistingServer:false},use:{...config.use,baseURL:'http://127.0.0.1:9426'}};
