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
  const google = ((req.body && req.body.google) || (req.query.google && JSON.parse(decodeURIComponent(req.query.google))));

  const maxDays = 5;
  const weightExponent = 1.5;

  try{
    // Check all required params are available
    if(key && pass && secret) {
      // Everything is at least available, attempt the workflow.
      coinbase.init(key, pass, secret);
      googleSheets.init(google?.sheets?.key);

      // 
      let fills = {};

      if(orders) {
        if(orders.depositSource && orders.dailyUsd) {
          //deposit.paymentId = (await coinbase.paymentMethods())?.filter(paymentMethod => new RegExp(orders["deposit-source"],'i').test(paymentMethod.name))?.[0]?.id;      
          
          if(google && google.sheets && google.sheets.names){
            for(const name of google.sheets.names){
              (await googleSheets.get(name))?.forEach(fill => {
                (fills[fill.product] || (fills[fill.product] = [])).push(fill);
              });
            }            
          }

          for(const {product, weight} of orders.products) {            
            // Get all the coinbase fills for this product
            (await coinbase.fills(product))?.forEach(fill => {
              (fills[fill.product_id] || (fills[fill.product_id] = [])).push(fill);
            });

            // Calculate total amount bought
            fills[product].totalAmount = fills[product]
              ?.filter((fill) => /buy/i.test(fill.side))
              ?.reduce((total, fill) => total + (fill.size));
            // Calculate total cost for this product
            fills[product].totalCost = fills[product]
              ?.filter((fill) => /buy/i.test(fill.side))
              ?.reduce((total, fill) => total + (fill.price * fill.size));
            // Calculate average price per unit of this product
            fills[product].averageCost = fills[product].totalCost / fills[product].totalAmount;
            fills[product].currentCost = (await coinbase.products.stats(product))?.last;
            fills[product].adjustedWeight = weight * Math.pow((fills[product].averageCost / fills[product].currentCost), weightExponent);

            // Determine the timestamp of the last purchase
            fills[product].latest = fills[product]
              ?.filter(fill => fill.created_at && /buy/i.test(fill.side))
              ?.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
              ?.[0];
            // Calculate the time since the last purchase
            fills[product].elapsed = Math.max(maxDays, Math.abs(new Date() - new Date(fills[product].latest)) / (1000 * 60 * 60 * 24));
          }

          fills.totalWeight = orders.products?.reduce((total, {product, weight}) => total + (fills[product].adjustedWeight));
          fills.deposit = 0;

          for(const {product, weight} of orders.products) {
            fills[product].spendRatio = orders.dailyUsd * fills[product].elapsed * (fills[product].adjustedWeight / fills.totalWeight);
            fills.deposit += fills[product].spendRatio
          }


          // At this point, deposit {fills.deposit} from {orders.depositSource}, then iterate and purchase
          // amounts based on {fills[product].spendRatio}.
          // Already have {fills[product].currentCost}
          // Calculate amount to buy based on {fills[product].spendRatio / fills[product].currentCost}
          // Get {coinbase.product(product)} and determine {base_min_size}
          // If purchase amount is too small, warn
          // Adjust purchase price up by {10 * quote_increment}
          
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
      google: {
        sheets: {
          key: '1zaTe6roOJZB5zKxSdQJB6vbss7UsCVD_JXAJRYgnM1M',
          names: [
            'AnchorUSD',
            'Venmo'
          ]
        }        
      },
      orders: {
        depositSource: "Evansville",
        dailyUsd: 20.00,
        products: [
          {
            product: "BTC-USD",
            weight: 2
          },
          {
            product: "ETH-USD",
            weight: 2
          },
          {
            product: "DOT-USD",
            weight: 1
          },
          {
            product: "ADA-USD",
            weight: 1
          },
          {
            product: "ALGO-USD",
            weight: 1
          },
          {
            product: "LTC-USD",
            weight: 1
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