const https = require('https');

// Exported functions
module.exports = {
  init: function (key) {
    this.api = {
      hostname: 'docs.google.com',
      key: key
    };
  },

  makePath: function(sheet, format='csv') {
    return `/spreadsheets/d/${this.api.key}/gviz/tq?tqx=out:${format}&sheet=${sheet}`;
  },

  transformCsv: function(csv) {    
    var result = [];
    // Remove all double quotes " that may exist
    csv = csv.replace(/"/g,'');
    var lines=csv.split("\n");
    var headers=lines[0].split(",");

    for(var i=1;i<lines.length;i++){
      var obj = {};
      var currentline=lines[i].split(",");
      if(currentline.length == headers.length) {
        for(var j=0;j<headers.length;j++){
          obj[headers[j]] = currentline[j];
        }
        result.push(obj);
      }
    }
    
    return result;
  },

  get: function(sheet, format='csv') {
    return new Promise((resolve, reject) => {
      const api = this.api;
      // Make the request
      const request = https.request({
        hostname: api.hostname,
        method: 'GET',
        path: this.makePath(sheet, format),
        headers: {
          'User-Agent': 'Mozilla/5.0', // required, just default to Mozilla...
        }
      }, (response) => {
        let data = '';

        // A chunk of data has been received.
        response.on('data', (chunk) => {
          data += chunk;
        });
      
        // The whole response has been received. Print out the result.
        response.on('end', () => {
          switch(format){
            case 'csv': {
              resolve(this.transformCsv(data));
              break;
            }
            default: {
              resolve(data);
              break;
            }
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });
      
      request.end();
    });
  }
};