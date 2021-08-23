const sign = require('./sign');
const https = require('https');

// Exported functions
module.exports = {
  init: function (key, pass, secret) {
    this.api = {
      hostname: 'api.pro.coinbase.com',
      key: key,
      pass: pass,
      secret: secret
    };

    this.products = function (productId) {
      return module.exports.request({
        method: 'GET',
        path: '/products/' + (productId ? productId + '/' : '')
      });
    };

    this.products.stats = function (productId) {
      return module.exports.request({
        method: 'GET',
        path: `/products/${productId}/stats/`
      });
    };

    this.products.ticker = function (productId) {
      return module.exports.request({
        method: 'GET',
        path: `/products/${productId}/ticker/`
      });
    };    
  },

  request: function (requestParams) { 
    return new Promise((resolve, reject) => {
      const api = this.api;
      const timestamp = Date.now() / 1000;

      // If it is GET request, convert body to query params
      if(requestParams.method == 'GET' && typeof requestParams.body === 'object'){
        // Set initial separator to query indicator '?'
        let separator = '?';
        // Iterate all keys in the body object
        Object.keys(requestParams.body).forEach((key)=>{
          // Add the key=value pair to the path and continue
          requestParams.path += `${separator}${(key)}=${(requestParams.body[key])}`;
          // After the first key=value pair, swap the separator for additional params
          separator = '&';
        });
        // Set the body to null, since all keys have been converted (don't want to reprocess them when signing the message)
        requestParams.body = null;
      }

      // Make the request
      const request = https.request({
        hostname: api.hostname,
        method: requestParams.method,
        path: requestParams.path,
        headers: {
          'User-Agent': 'curl/7.47.0', // required
          'CB-ACCESS-TIMESTAMP': timestamp,
          'CB-ACCESS-PASSPHRASE': api.pass,
          'CB-ACCESS-KEY': api.key,
          'CB-ACCESS-SIGN': sign.base64(
            api.secret,
            timestamp,
            requestParams.method,
            requestParams.path,
            requestParams.body
          ),
        }
      }, (response) => {
        let data = '';

        // A chunk of data has been received.
        response.on('data', (chunk) => {
          data += chunk;
        });
      
        // The whole response has been received. Print out the result.
        response.on('end', () => {
          let body = JSON.parse(data);
          if(body.message){
            resolve({
              error: body.message,
              data: {
                timestamp: timestamp,
                requestParams: requestParams,
              }
            });
          } else {
            resolve(body);
          }            
        });
      });

      request.on('error', (error) => {
        reject(error);
      });
      
      request.end();
    }
  )},

  accounts: function () {
    let requestParams = {
      method: 'GET',
      path: '/accounts/'
    };

    return module.exports.request(requestParams);
  },

  fills: function (productId) {
    let requestParams = {
      method: 'GET',
      path: '/fills/',
      body: {
        product_id: productId
      }
    };

    return module.exports.request(requestParams);
  },

  paymentMethods: function () {
    let requestParams = {
      method: 'GET',
      path: '/payment-methods/'
    };

    return module.exports.request(requestParams);
  },

  placeOrder: function (params) {    
    let requestParams = {
      method: 'POST',
      path: '/orders/',
      body: params
    };

    return module.exports.request(requestParams);
  },

  cancelOrder: function (params) {    
    let requestParams = {
      method: 'DELETE',
      path: `/orders/${params.clientOid ? `client:${params.clientOid}` : params.id}/`
    };

    return module.exports.request(requestParams);
  },

  cancelOrders: function (productId) {    
    let requestParams = {
      method: 'DELETE',
      path: `/orders/`,
      body: productId
    };

    return module.exports.request(requestParams);
  },

  getOrder: function (params) {
    let requestParams = {
      method: 'GET',
      path: `/orders/${params.clientOid ? `client:${params.clientOid}` : params.id}/`
    };

    return module.exports.request(requestParams);
  },

  listOrders: function (params) {    
    let requestParams = {
      method: 'GET',
      path: '/orders/',
      body: params
    };

    return module.exports.request(requestParams);
  },

  deposits: {
    paymentMethod: function (params) {
      return module.exports.request({
        method: 'POST',
        path: '/deposits/payment-method/',
        body: params
      });
    }
  }

};