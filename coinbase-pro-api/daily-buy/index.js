const coinbase = require('../coinbase');
const googleSheets = require('../../google-sheets');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function roundToMinUnit(value, minUnit){
  const inverse = 1 / parseFloat(minUnit);
  const inverseLog = Math.log10(inverse);
  return parseFloat(parseFloat(value).toFixed(inverseLog));
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
      let fills = {
        totalWeight: 0,
        amountToDeposit: 0
      };
      let log = [];
      let response = null;

      if(orders) {
        if(orders.depositSource && orders.dailyUsd) {          
          if(google && google.sheets && google.sheets.names){
            for(const name of google.sheets.names){
              (await googleSheets.get(name))?.forEach(fill => {
                (fills[fill.product] || (fills[fill.product] = [])).push(fill);
              });
            }            
          }

          for(const {product, weight} of orders.products) {            
            // Get all coinbase fills for this product
            (await coinbase.fills(product))?.forEach(fill => {
              (fills[fill.product_id] || (fills[fill.product_id] = [])).push(fill);
            });
            await sleep(1000);

            let current = fills[product];

            // Get current coinbase product info
            current.product = (await coinbase.products(product));
            current.stats = (await coinbase.products.stats(product));            

            // Calculate total amount bought
            current.totalAmount = current
              ?.filter((fill) => /buy/i.test(fill.side))
              ?.reduce((total, fill) => {
                return Number(total) + Number(fill.size);
              }, 0);
            // Calculate total cost for this product
            current.totalCost = current
              ?.filter((fill) => /buy/i.test(fill.side))
              ?.reduce((total, fill) => Number(total) + (Number(fill.price) * Number(fill.size)), 0);
            // Calculate average price per unit of this product
            current.averageCost = current.totalCost / current.totalAmount;
            
            current.adjustedWeight = weight * Math.pow((current.averageCost / current.stats?.last), weightExponent);

            // Determine the timestamp of the last purchase
            current.latest = current
              ?.filter(fill => fill.created_at && /buy/i.test(fill.side))
              ?.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
              ?.[0];
            // Calculate the time since the last purchase
            current.elapsed = Math.min(maxDays, Math.abs(new Date() - new Date(current.latest?.created_at)) / (1000 * 60 * 60 * 24));
            fills.totalWeight += current.adjustedWeight;
          }

          for(const {product, weight} of orders.products) {
            let current = fills[product];
            current.spendRatio = orders.dailyUsd * current.elapsed * (current.adjustedWeight / fills.totalWeight);
            current.amountToBuy = roundToMinUnit((current.spendRatio / current.stats?.last), current.product?.base_increment);

            if(current.amountToBuy < current.product?.base_min_size) {              
              log.push(`Purchase amount ${current.amountToBuy} is too small for ${product}. Minimum amount is ${current.product?.base_min_size}`);
              current.amountToBuy = null; // Reset amount to buy since we don't have enough
              continue;
            }

            current.adjustedPrice = roundToMinUnit((Number(current.stats?.last) + (Number(current.product?.quote_increment) * 10)), Number(current.product?.quote_increment));
            fills.amountToDeposit += current.spendRatio;
          }

          while(false) {
            response = (await coinbase.paymentMethods());

            if(!response || response.error) {
              log.push(response || `Empty coinbase response`);
              break;
            } 

            fills.paymentId = response.filter(paymentMethod => new RegExp(orders.depositSource,'i').test(paymentMethod.name))?.[0]?.id;      

            response = (await coinbase.deposits.paymentMethod({
              'payment_method_id': fills.paymentId,
              'amount': fills.amountToDeposit,
              'currency': 'USD'
            }));

            if(!response || response.error) {
              log.push(response || `Empty coinbase response`);
              break;
            } 
          }

          // Loop last time to make purchases...
          for(const {product, weight} of orders.products) {
            let current = fills[product];
            
            continue;
            
            response = (await coinbase.placeOrder({
              'side': 'buy',
              'product-id': product,
              'size': current.amountToBuy,
              'price': current.adjustedPrice
            }));

            if(!response || response.error) {
              log.push(response || `Empty coinbase response`);
              continue;
            } 

          }

          // At this point, deposit {fills.deposit} from {orders.depositSource}, then iterate and purchase
          // amounts based on {current.spendRatio}.
          // x Already have {current.currentCost}
          // x Calculate amount to buy based on {current.spendRatio / current.currentCost}
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
          google: google,
          log: log
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
