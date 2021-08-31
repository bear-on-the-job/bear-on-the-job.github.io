const coinbase = require('../coinbase');
const googleSheets = require('../../google-sheets');

module.exports = async function (context, req) {
  const LOG_TYPE = {
    INFO: "INFO",
    ERROR: "ERROR"
  };

  const currencyPrefix = {
    'USD': '$',
    'GBP': ''
  };
  class Logger {
    constructor() {}

    content = [];

    log(entry) {
      this.content.push({
        logType: entry?.type,
        message: entry?.message,
        data: entry?.data
      });
    }

    get() {
      return this.content;
    }
  };


  // Get params from the request    
  const key = ((req.body && req.body.key) || (req.query.key && decodeURIComponent(req.query.key)));
  const pass = ((req.body && req.body.pass) || (req.query.pass && decodeURIComponent(req.query.pass)));
  const secret = ((req.body && req.body.secret) || (req.query.secret && decodeURIComponent(req.query.secret)));
  const orders = ((req.body && req.body.orders) || (req.query.orders && decodeURIComponent(req.query.orders)));
  const google = ((req.body && req.body.google) || (req.query.google && JSON.parse(decodeURIComponent(req.query.google))));

  const maxDays = 5;
  const weightExponent = 1.5;
  const logger = new Logger();

  /**
   * Helper function to emulate sleep() functions in other languages. When 
   * called with 'await', will pause current thread for specified time.
   * 
   * @param {Number} ms 
   *  Amount of time to sleep, in milliseconds.
   * @returns {Promise}
   *  Returns with no execution when time elapses.
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Rounding helper function, using minimum unit allowed. 
   * 
   * @param {Number} value 
   *  Value to be rounded. Automatically converted to float before rounding.
   * @param {Number} minUnit 
   *  Minimum unit size for rounding. Defaults to 0.01 to easily round USD
   *  currency values.
   * @returns {float}
   *  Rounded value as a float.
   */
  function round(value, minUnit = 0.01) {
    const inverse = 1 / parseFloat(minUnit);
    const inverseLog = Math.log10(inverse);
    return parseFloat(parseFloat(value).toFixed(inverseLog));
  }


  function checkResponse(response, attempt) {
    if (!response || response.error) {
      logger.log({
        type: LOG_TYPE.ERROR,
        message: response?.error || `Empty coinbase response${attempt ? ` trying to ${attempt}` : ``}`,
        data: response
      });
      return false;
    } else {
      return true;
    }
  }

  try {
    // Check all required params are available
    if (key && pass && secret) {
      // Everything is at least available, attempt the workflow.
      coinbase.init(key, pass, secret);

      // Initialize the fills object, which will be used to track calculations
      // and amounts for products.
      let fills = {
        totalWeight: 0,
        amountToDeposit: 0
      };

      // Initialize a reusable response object, to collect data from API 
      // calls.
      let response = null;

      // Check that we have orders available
      if (orders) {
        // Check that a funding source and desired daily spend has been 
        // provided.
        if (orders.deposit?.source && orders.deposit?.daily) {

          // Check if google information has been provided, and get all 
          // relevant fills from google sheets. The primary source of 
          // our fills is from Coinbase, but this will provide supplemental
          // information if some currency was purchasd from other sources.
          if (google && google.sheets && google.sheets.names) {
            // Initialize the API
            googleSheets.init(google.sheets.key);
            // Iterate through each named sheet
            for (const name of google.sheets.names) {
              // Iterate the fills from that sheet
              (await googleSheets.get(name))?.forEach(fill => {
                // Check that the current fill matches a product from the
                // orders list
                if (orders.products.find(({ product, weight }) => product == fill.product)) {
                  // Add the fill to the full list of fills. Will be combined
                  // with other fill sources later.
                  (fills[fill.product] || (fills[fill.product] = [])).push(fill);
                }
              });
            }
          }

          // Iterate through all products in the order list
          for (const { product, weight } of orders.products) {
            // Get all coinbase fills for this product
            (await coinbase.fills(product))?.forEach(fill => {
              (fills[fill.product_id] || (fills[fill.product_id] = [])).push(fill);
            });

            // Reference to the current product fills.
            const current = fills[product];

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
            // Calculate adjusted weight, based on our average cost compared
            // to the current cost of the product.
            current.adjustedWeight = weight * Math.pow((current.averageCost / current.stats?.last), weightExponent);
            // Accumulate to determine total adjusted weights.
            fills.totalWeight += current.adjustedWeight;

            // Determine the timestamp of the last purchase
            current.latest = current
              ?.filter(fill => fill.created_at && /buy/i.test(fill.side))
              ?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              ?.[0];
            // Calculate the time since the last purchase
            current.elapsed = Math.min(maxDays, Math.abs(new Date() - new Date(current.latest?.created_at)) / (1000 * 60 * 60 * 24));
          }

          // Iterate a second time to determine spend amounts. This needs to 
          // happen in a second loop because we must wait for 
          // {fills.totalWeight} to be complete.
          for (const { product, weight } of orders.products) {
            // Reference to the current product fills.
            const current = fills[product];

            // Calculate how much to spend on current product, based on time 
            // since last purchase, and the adjusted weight of the product.
            current.spendRatio = orders.deposit?.daily * current.elapsed * (current.adjustedWeight / fills.totalWeight);
            // Calculate amount to buy, based on our desired spend amount, and 
            // current price of product.
            current.amountToBuy = round((current.spendRatio / current.stats?.last), current.product?.base_increment);

            // Check if the amount to buy would be too small for this product.
            if (current.amountToBuy < current.product?.base_min_size) {
              // Log an error, since we want to buy an increment that is
              // too small, an the purchase would fail if we attempted.
              logger.log({
                type: LOG_TYPE.ERROR,
                message: `Purchase amount ${current.amountToBuy} is too small for ${product}. Minimum amount is ${current.product?.base_min_size}`,
                data: current
              });
              // Reset amount to buy since we don't have enough
              current.amountToBuy = null;
              // Proceed without including this product in the total sum we
              // intend to deposit.
              continue;
            }

            // Adjust the price so it is slightly above current price. This 
            // helps the limit order fill immediately.
            current.adjustedPrice = round((Number(current.stats?.last) + (Number(current.product?.quote_increment) * 10)), Number(current.product?.quote_increment));
            // Accumulate the total amount we need to deposit to cover all of
            // the buys.
            fills.amountToDeposit += current.spendRatio;
          }

          // Encapsulate calls in a while loop, so we can exit prematurely 
          // and skip additional processing.
          if (true) {
            // Check that we have a valid amount to deposit.
            if (fills.amountToDeposit && orders.deposit?.currency) {
              // Get a list of payment methods available to Coinbase.
              response = await coinbase.paymentMethods();

              // Check the response...
              if (checkResponse(response, 'coinbase.paymentMethods()')) {
                // Extract the payment ID and check that it is valid
                if (fills.paymentId = response.filter(paymentMethod => new RegExp(orders.deposit?.source, 'i').test(paymentMethod.name))?.[0]?.id) {
                  // Attempt to make the deposit...
                  const deposit = {
                    payment_method_id: fills.paymentId,
                    amount: round(fills.amountToDeposit),
                    currency: orders.deposit?.currency
                  };

                  response = (await coinbase.deposits.paymentMethod(deposit));

                  // Check the response...
                  if (checkResponse(response, 'coinbase.deposits.paymentMethod()')) {
                    logger.log({
                      type: LOG_TYPE.INFO,
                      message: `Deposit for ${currencyPrefix[orders.deposit?.currency]}${round(deposit.amount, 0.01)} ${deposit.currency} from ${orders.deposit?.source} successful.`,
                      data: response
                    });

                    // Iterate on last time to make the purchases, now that the deposit
                    // has cleared.
                    for (const { product, weight } of orders.products) {
                      const current = fills[product];

                      // Check and make sure there are valid amounts before
                      // attempting the purchase.
                      if (current?.amountToBuy && current?.adjustedPrice) {
                        // Try to place the order...
                        const order = {
                          type: 'limit',
                          side: 'buy',
                          product_id: product,
                          size: current.amountToBuy,
                          price: current.adjustedPrice
                        };

                        response = {}; //(await coinbase.placeOrder(order));

                        // Check the response...
                        if (checkResponse(response, `coinbase.placeOrder(${product})`)) {
                          // Success, add the information to the log.
                          logger.log({
                            type: LOG_TYPE.INFO,
                            message: `Placed ${order.type} ${order.side} order for ${order.size} ${order.product_id} at price ${currencyPrefix[orders.deposit?.currency]}${round(order.price, 0.01)} ${orders.deposit?.currency}.`,
                            data: response
                          });
                        }
                      }
                    }
                  }
                } else { // No payment method
                  logger.log({
                    type: LOG_TYPE.ERROR,
                    message: `No payment method found matching name '${paymentMethod.name}'`,
                    data: paymentMethod
                  });
                }
              }
            } else { // Invalid amount to deposit
              logger.log({
                type: LOG_TYPE.ERROR,
                message: `Invalid amount to deposit: ${fills.amountToDeposit}.`,
                data: fills
              });
            }
          }
        }
      }

    } else {
      // Missing something...
      context.res = { status: 401 };
      logger.log({
        type: LOG_TYPE.ERROR,
        message: `Missing required params for authorization`,
        data: {
          key: !!key,
          pass: !!pass,
          secret: !!secret
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
    log: logger.get()
  };
};
