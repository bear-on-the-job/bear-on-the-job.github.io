var sign = require('../sign');
const https = require('https');

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const name = (req.query.name || (req.body && req.body.name));

    var params = {
        timestamp: Date.now() / 1000,
        method: 'GET',
        hostname: 'api.pro.coinbase.com',
        path: '/accounts/',
        body: null
    };

    const request = https.request({
        hostname: params.hostname,
        path: params.path,
        method: params.method,
        agent: false,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'CB-ACCESS-PASSPHRASE': 'j9vx8spq6uq',
            'CB-ACCESS-KEY': 'a88bee5c08810ddd74d9e43275887fa9',
            'CB-ACCESS-SIGN': sign.base64(params.timestamp, params.method, params.path),
            'CB-ACCESS-TIMESTAMP': params.timestamp
        }
    }, (response) => {
        let data = '';

        // A chunk of data has been received.
        response.on('data', (chunk) => {
          data += chunk;
        });
      
        // The whole response has been received. Print out the result.
        response.on('end', () => {
          console.log(JSON.parse(data));
        });
    });

    request.on('error', (error) => {
        console.error(error);
    });
    
    request.end();

    const responseMessage = name
        ? "Hello, " + name + sign.base64('GET', '/accounts/') + ". This HTTP triggered function executed successfully."
        : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: responseMessage
    };
}