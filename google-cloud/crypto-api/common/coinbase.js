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

      // Init variables to be used for the request.
      let data = '';
      let body = requestParams.body;
      let path = requestParams.path;
      const requestData = requestParams?.body ? JSON.stringify(requestParams.body) : null;
      
      // Get current timestamp to be most accurate.
      const timestamp = Date.now() / 1000;

      // Init attempt count if it doesn't exist.
      requestParams.attempt = requestParams.attempt || 1;
      requestParams.response = requestParams.response || {};

      // If it is GET request, convert body to query params
      if(requestParams.method == 'GET' && requestParams.body && typeof requestParams.body === 'object'){
        // Set initial separator to query indicator '?'
        let separator = '?';
        // Iterate all keys in the body object
        Object.keys(requestParams.body).forEach((key)=>{
          // Add the key=value pair to the path and continue
          path += `${separator}${(key)}=${(requestParams.body[key])}`;
          // After the first key=value pair, swap the separator for additional params
          separator = '&';
        });
        // Set the body to null, since all keys have been converted (don't want to reprocess them when signing the message)
        body = null;
      }

      const options = {
        hostname: api.hostname,
        method: requestParams.method,
        path: path,
        headers: {
          'User-Agent': 'curl/7.47.0', // required
          'CB-ACCESS-TIMESTAMP': timestamp,
          'CB-ACCESS-PASSPHRASE': api.pass,
          'CB-ACCESS-KEY': api.key,
          'CB-ACCESS-SIGN': sign.base64(
            api.secret,
            timestamp,
            requestParams.method,
            path,
            body
          ),
        }
      };

      if(/post/i.test(requestParams.method) && requestData) {
        options.headers['Content-Length'] = requestData.length;
        options.headers['Content-Type'] = 'application/json';
      }

      // Make the request
      const request = https.request(options, (response) => {            
        before = response.headers["cb-before"];
        after = response.headers["cb-after"];

        // A chunk of data has been received. 
        response.on('data', (chunk) => {
          data += chunk;
        });
    
        // The whole response has been received. Print out the result.
        response.on('end', () => {
          data = JSON.parse(data);
          if (data.message) {
            resolve({
              error: data.message,
              data: {
                timestamp: timestamp,
                requestParams: requestParams,
              }
            });
          } else {
            if (!after) {
              // Last page, just resolve
              resolve(data); 
            } else {
              // More pages, add the 'after' param to next request.
              (requestParams.body = requestParams.body || {})["after"] = after;
              // Merge the current data array, and the next data array, and resolve.
              module.exports.request(requestParams).then((next) => {
                resolve([...data, ...next]);
              });
            }
          }
        });
      });

      request.on('error', (error) => {
        if (requestParams.attempt < 4) {
          requestParams.attempt++;
          resolve(null);
        } else {
          reject({
            error: error,
            requestParams: requestParams
          });
        }
      });
      
      if(requestData) {
        request.write(requestData);
      }

      request.end();
    })
    .then((resolved) => {
      if(resolved){
        // Success, return whatever was processed
        return resolved;
      } else {
        // Retry...
        return module.exports.request(requestParams);
      }
    });
  },

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