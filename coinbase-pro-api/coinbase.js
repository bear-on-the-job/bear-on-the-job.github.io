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

    /**
     * (https://docs.pro.coinbase.com/#get-products)
     * 
     * @param {string} productId 
     *  Textual product ID (ex: 'BTC-USD')
     * @returns {Promise<JSON>} 
     *  JSON object from the query response 
     */
    this.products = function (productId) {
      return module.exports.request({
        method: 'GET',
        path: '/products/' + (productId ? productId + '/' : '')
      });
    };

    /**
     * (https://docs.pro.coinbase.com/#get-24hr-stats)
     * 
     * @param {string} productId 
     *  Textual product ID (ex: 'BTC-USD')
     * @returns {Promise<JSON>} 
     *  JSON object from the query response 
     */
    this.products.stats = function (productId) {
      return module.exports.request({
        method: 'GET',
        path: `/products/${productId}/stats/`
      });
    };

    /**
     * (https://docs.pro.coinbase.com/#get-product-ticker)
     * 
     * @param {string} productId 
     *  Textual product ID (ex: 'BTC-USD')
     * @returns {Promise<JSON>} 
     *  JSON object from the query response 
     */
    this.products.ticker = function (productId) {
      return module.exports.request({
        method: 'GET',
        path: `/products/${productId}/ticker/`
      });
    };    
  },

  /**
   * 
   * @param {JSON} requestParams 
   * @returns {Promise<JSON>}
   */
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

  /**
   * 
   * @returns {Promise<JSON>}
   */
  accounts: function () {
    return module.exports.request({
      method: 'GET',
      path: '/accounts/'
    });
  },

  fills: function (productId) {
    return module.exports.request({
      method: 'GET',
      path: '/fills/',
      body: {
        product_id: productId
      }
    });
  },

  paymentMethods: function () {
    return module.exports.request({
      method: 'GET',
      path: '/payment-methods/'
    });
  },

  placeOrder: function (params) {
    return module.exports.request({
      method: 'POST',
      path: '/orders/',
      body: params
    });
  },

  cancelOrder: function (params) {
    return module.exports.request({
      method: 'DELETE',
      path: `/orders/${params.clientOid ? `client:${params.clientOid}` : params.id}/`
    });
  },

  cancelOrders: function (productId) {
    return module.exports.request({
      method: 'DELETE',
      path: `/orders/`,
      body: productId
    });
  },

  getOrder: function (params) {
    return module.exports.request({
      method: 'GET',
      path: `/orders/${params.clientOid ? `client:${params.clientOid}` : params.id}/`
    });
  },

  listOrders: function (params) {
    return module.exports.request({
      method: 'GET',
      path: '/orders/',
      body: params
    });
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