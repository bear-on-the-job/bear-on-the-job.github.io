const API = {
  coinbase: require('../coinbase'),
  google: require('../google')
};

const { LOG_TYPE, Logger } = require('../logger');

module.exports = async function (context, req) {
  // Get params from the request
  const coinbase = ((req.body && req.body.coinbase) || (req.query.coinbase && decodeURIComponent(req.query.coinbase)));
  const google = ((req.body && req.body.google) || (req.query.google && JSON.parse(decodeURIComponent(req.query.google))));
  const products = ((req.body && req.body.products) || (req.query.products && JSON.parse(decodeURIComponent(req.query.products))));

  // Logger instance to track execution.
  const logger = new Logger();

  // Initialize the fills object, which will be used to track calculations
  // and amounts for products.
  let fills = {};

  try {
    // Check all required params are available
    if (coinbase?.key && coinbase?.passphrase && coinbase?.secret) {
      // Everything is at least available, attempt the workflow.
      API.coinbase.init(coinbase.key, coinbase.passphrase, coinbase.secret);

      // Check if google information has been provided, and get all 
      // relevant fills from google sheets. The primary source of 
      // our fills is from Coinbase, but this will provide supplemental
      // information if some currency was purchasd from other sources.
      if (google?.sheets?.names && google?.sheets?.key) {
        // Initialize the API
        API.google.init(google.sheets.key);
        // Iterate through each named sheet
        for (const name of google.sheets.names) {
          // Iterate the fills from that sheet
          (await API.google.get(name))?.forEach(fill => {
            // Check that the current fill matches a product from the list
            if (products.find(product => product == fill.product)) {
              // Add the fill to the full list of fills. Will be combined
              // with other fill sources later.
              (fills[fill.product] || (fills[fill.product] = [])).push(fill);
            }
          });
        }
      }

      // Iterate through all products in the order list
      for (const product of products) {
        // Get all coinbase fills for this product
        (await API.coinbase.fills(product))?.forEach(fill => {
          (fills[fill.product_id] || (fills[fill.product_id] = [])).push(fill);
        });

        // Reference to the current product fills.
        const current = fills[product];

        // Get current coinbase product info
        current.product = (await API.coinbase.products(product));
        current.stats = (await API.coinbase.products.stats(product));

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

        // Determine the timestamp of the last purchase
        current.latest = current
          ?.filter(fill => fill.created_at && /buy/i.test(fill.side))
          ?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          ?.[0];
        // Calculate the time since the last purchase
        current.elapsed = {
          total: Math.abs(new Date() - new Date(current.latest?.created_at)) / (1000/*ms*/ * 60/*secs*/ * 60/*mins*/ * 24/*hours*/)
        };
        current.elapsed.seconds = current.elapsed.total / 1000;
        current.elapsed.minutes = current.elapsed.seconds / 60;
        current.elapsed.hours = current.elapsed.minutes / 60;
        current.elapsed.days = current.elapsed.hours / 24;

        // Clear the array portion as we don't want to report that
        current.length = 0;
      }

    } else {
      // Missing something...
      context.res = { status: 401 };
      logger.log({
        type: LOG_TYPE.ERROR,
        message: `Missing required params for authorization`,
        data: {
          key: !!coinbase?.key,
          pass: !!coinbase?.passphrase,
          secret: !!coinbase?.secret
        }
      });
    }
  } catch (error) {
    // Exception
    context.res = { status: 500 };
    logger.log({
      type: LOG_TYPE.ERROR,
      message: `Exception caught`,
      data: JSON.parse(JSON.stringify(error))
    });
  }

  (context.res = context.res || { status: 200 }).body = {
    log: logger.get(),
    data: fills
  };
};