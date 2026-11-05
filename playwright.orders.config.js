import config from './playwright.config.js';
export default {...config,testMatch:'orders.spec.js',testIgnore:[],webServer:{command:'node server/commerce-demo.mjs',url:'http://127.0.0.1:9425',reuseExistingServer:false},use:{...config.use,baseURL:'http://127.0.0.1:9425'}};
