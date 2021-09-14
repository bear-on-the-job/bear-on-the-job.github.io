var crypto = require('crypto');

module.exports = {
  base64: function (secret, timestamp, method, path, body) {
    // create the prehash string by concatenating required parts
    var what = timestamp + method + path + (body && body !== undefined ? typeof body === 'object' ? JSON.stringify(body) : body.toString() : '');

    // decode the base64 secret
    var key = Buffer.from(secret, 'base64');

    // create a sha256 hmac with the secret
    var hmac = crypto.createHmac('sha256', key);

    // sign the require message with the hmac
    // and finally base64 encode the result
    return hmac.update(what).digest('base64');
  }
};