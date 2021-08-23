const coinbase = require('../coinbase');
const googleSheets = require('../../google-sheets');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function (context, req) {
  // Get params from the request    
  const key = ((req.body && req.body.key) || (req.query.key && decodeURIComponent(req.query.key)));
  const pass = ((req.body && req.body.pass) || (req.query.pass && decodeURIComponent(req.query.pass)));
  const secret = ((req.body && req.body.secret) || (req.query.secret && decodeURIComponent(req.query.secret)));
  const orders = ((req.body && req.body.orders) || (req.query.orders && decodeURIComponent(req.query.orders)));

  try{
    // Check all required params are available
    if(key && pass && secret) {
      // Everything is at least available, attempt the workflow.
      coinbase.init(key, pass, secret);
      googleSheets.init('1zaTe6roOJZB5zKxSdQJB6vbss7UsCVD_JXAJRYgnM1M');

      // 
      let fills = {};
      
      

      if(orders) {
        if(orders["deposit-source"]) {
          //deposit.paymentId = (await coinbase.paymentMethods())?.filter(paymentMethod => new RegExp(orders["deposit-source"],'i').test(paymentMethod.name))?.[0]?.id;      
          
          (await googleSheets.get('AnchorUSD'))?.forEach(fill => {
            (fills[fill.product] || (fills[fill.product] = [])).push(fill);
          });

          for(let product of orders["products"]) {
            (await coinbase.fills(product["product-id"]))?.forEach(fill => {
              (fills[fill.product_id] || (fills[fill.product_id] = [])).push(fill);
            });
          }

          for(let product in fills) {
            fills[product].latest = fills[product]
              ?.filter(fill => 
                fill.created_at && /buy/i.test(fill.side)
              )
              ?.sort((a,b) => 
                new Date(b.created_at) - new Date(a.created_at)
              )
              ?.[0];
          }
        }
      }

      //context.log(fills);
      context.res = {
        status: 200,
        body: {
          deposit: deposit,
          google: google
        }
      };
    } else {
      // Missing something...
      context.res = {
        status: 401,
        body: {
          error: `Missing required params for authorization`,
          data: {
            key: !!key,
            pass: !!pass,
            secret: !!secret
          }
        }
      };
    }
  } catch(error) {
    // Exception
    context.res = {
      status: 500,
      body: {
        error: `Exception caught`,
        data: error
      }
    };
  }
};


()=>{
  fetch('http://localhost:7071/api/daily-buy', {
    method: 'POST',
    body: JSON.stringify({
      secret: 'pHZAmROTDAYMHAk4BFOzxGTgDGhU1rw1+YojWdES+H5HZg5caP1Aumnx11wvtHwZT4mcAysb4Z0Opecy0pC3Mg==',
      key: 'a88bee5c08810ddd74d9e43275887fa9',
      pass: 'j9vx8spq6uq',
      orders: {
        "deposit-source": "Evansville",
        "daily-usd": 20.00,
        "products": [
          {
            "product-id": "BTC-USD",
            "weight": 2
          },
          {
            "product-id": "ETH-USD",
            "weight": 2
          },
          {
            "product-id": "DOT-USD",
            "weight": 1
          },
          {
            "product-id": "ADA-USD",
            "weight": 1
          },
          {
            "product-id": "ALGO-USD",
            "weight": 1
          },
          {
            "product-id": "LTC-USD",
            "weight": 1
          }
        ]
      }
    }),
    headers: {
      'Content-type': 'application/json; charset=UTF-8'
    }
  })
  .then(res => res.json())
  .then(console.log)
}