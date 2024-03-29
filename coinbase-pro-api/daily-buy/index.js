'use strict';

const API = {
  coinbase: require('../coinbase'),
  google: require('../google')
};

//module.exports = async function (context, req) {
exports.dailyBuy = async function (req, res) {
  const context = {res: res};

  const DEFAULT = {
    DEPOSIT: {
      SOURCE: null,
      AMOUNT: 0,
      CURRENCY: 'USD',
      MINIMUM: 10,
      MAXIMUM: 200
    },
    WEIGHTING: {
      MAX_DAYS: 7,
      EXPONENT: 1
    }
  }

  /**
   * Const enum for supported currencies, to map 3-letter notation to 
   * prefix symbol, for more descriptive log messages.
   */
  const currencyPrefix = {
    'USD': '$',
    'GBP': ''
  };

  /**
   * Const enum for logging message types
   */
  const LOG_TYPE = {
    INFO: "INFO",
    ERROR: "ERROR"
  };
  /**
   * Logging class to simplify collection of log messages that will be 
   * reported when the request completes.
   */
  class Logger {
    constructor() { }

    content = [];

    /**
     * Logging function to add an entry with message and data to the log.
     * 
     * @param {object} entry 
     *  Object containing a type, message, and optional data object
     */
    log(entry) {
      this.content.push({
        logType: entry?.type || LOG_TYPE.INFO,
        message: entry?.message,
        data: entry?.data
      });
    }

    /**
     * Accessor to get the content array containing log entries.
     * 
     * @returns {Array}
     *  Array containing all the log entries so far.
     */
    get() {
      return this.content;
    }
  };

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
    return new Promise(resolve => setTimeout(()=>{resolve(true)}, ms));
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

  /**
   * 
   * @param {object} response 
   *  The response object to check
   * @param {string} attempt 
   *  An optional string to include in a log message if the response is empty
   * @returns {boolean}
   *  True if the response is valid, false if there was an error.
   */
  function coinbaseResponse(response, attempt) {
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


  // Get params from the request
  const coinbase = ((req.body && req.body.coinbase) || (req.query.coinbase && decodeURIComponent(req.query.coinbase)));
  const google = ((req.body && req.body.google) || (req.query.google && JSON.parse(decodeURIComponent(req.query.google))));
  const orders = ((req.body && req.body.orders) || (req.query.orders && decodeURIComponent(req.query.orders)));
  const overrides = ((req.body && req.body.overrides) || (req.query.overrides && decodeURIComponent(req.query.overrides)));

  const logger = new Logger();

  try {
    // Check all required params are available
    if (coinbase?.key && coinbase?.passphrase && coinbase?.secret) {
      // Everything is at least available, attempt the workflow.
      API.coinbase.init(coinbase.key, coinbase.passphrase, coinbase.secret);

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
        if (orders.deposit?.source && orders.deposit?.amount) {

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
                // Check that the current fill matches a product from the
                // orders list
                if (orders.products.find(({ product }) => product == fill.product)) {
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

            // Calculate adjusted weight, based on our average cost compared
            // to the current cost of the product.
            {
              // Math.pow() doesn't properly handle fractional exponents for
              // negative values, so use this helper function.
              const pow = (x, e) => {
                return x < 0 ? -Math.pow(-x, e) : Math.pow(x, e);
              }

              // y = (x-1)^e + 1
              const x = (current.averageCost / (current.stats?.last || current.averageCost));
              const e = (orders?.weighting?.exponent || DEFAULT.WEIGHTING.EXPONENT);
              const y = pow((x - 1), e) + 1;
              current.adjustedWeight = weight * y;
            }

            // Accumulate to determine total adjusted weights.
            fills.totalWeight += current.adjustedWeight;

            // Determine the timestamp of the last purchase
            current.latest = current
              ?.filter(fill => fill.created_at && /buy/i.test(fill.side))
              ?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              ?.[0];
            // Calculate the time since the last purchase. 
            current.elapsed = Math.min((orders?.weighting?.maxDays || DEFAULT.WEIGHTING.MAX_DAYS), Math.abs(new Date() - new Date(current.latest?.created_at)) / (1000/*ms*/ * 60/*secs*/ * 60/*mins*/ * 24/*hours*/));

            // If 'overrides' is specified in the query params, then force
            // the purchase to be at least that many day's worth.
            if (overrides?.days) {
              current.elapsed = Math.max(current.elapsed, overrides.days);
            }
          }

          // Iterate a second time to determine spend amounts. This needs to 
          // happen in a second loop because we must wait for 
          // {fills.totalWeight} to be complete.
          for (const { product, weight } of orders.products) {
            // Reference to the current product fills.
            const current = fills[product];
            const change = Number(current?.stats?.last || 1) / Number(current?.stats?.open || current?.stats?.last || 1);
            const scale = (((change - 1) * (change < 1 ? 4 : 0.1)) + 1);

            // Calculate how much to spend on current product, based on time 
            // since last purchase, and the adjusted weight of the product.
            current.spendRatio = ((orders.deposit?.amount || DEFAULT.DEPOSIT.AMOUNT) * current.elapsed * (current.adjustedWeight / fills.totalWeight)) / scale;
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
                data: {
                  amount: current.amountToBuy,
                  product: current.product
                }
              });
              // Reset amount to buy since we don't have enough
              current.amountToBuy = null;
              // Proceed without including this product in the total sum we
              // intend to deposit.
              continue;
            }

            // Adjust the price so it is slightly above current price. This 
            // helps the limit order fill immediately.
            current.adjustedPrice = round((Number(current.stats?.last) + (Number(current.product?.quote_increment) * 20)), Number(current.product?.quote_increment));
            // Accumulate the total amount we need to deposit to cover all of
            // the buys.
            fills.amountToDeposit += (current.amountToBuy * current.adjustedPrice);
          }

          // Increase deposit amount by 5% to cover slosh in orders
          fills.amountToDeposit *= 1.05;
          // Helper variables
          const currency = (orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY);
          const prefix = currencyPrefix[currency];

          // Cap deposits at a max
          if (fills.amountToDeposit < (orders.deposit?.maximum || DEFAULT.DEPOSIT.MAXIMUM)) {
            // Check that we have a valid amount to deposit.
            if (fills.amountToDeposit && orders.deposit?.currency) {
              if (coinbaseResponse(response = await API.coinbase.accounts(), 'API.coinbase.accounts()')) {
                const account = response.find(({ currency }) => currency == orders.deposit?.currency);
                const minimum = (orders.deposit?.minimum || DEFAULT.DEPOSIT.MINIMUM);

                fills.amountToDeposit -= (account?.available || 0);

                if (fills.amountToDeposit <= 0) {
                  // Already have enough in the account, no need to deposit,
                  // just attempt to buy.
                  fills.amountToDeposit = 0;
                  logger.log({
                    type: LOG_TYPE.INFO,
                    message: `Account already has ${currencyPrefix[account?.currency]}${round(account?.available, 0.01)} ${account?.currency} available, no need to deposit additional funds.`,
                    data: account
                  });
                } else {
                  if (fills.amountToDeposit < minimum) {
                    fills.amountToDeposit = minimum;
                  }

                  // Get a list of payment methods available to Coinbase.
                  response = await API.coinbase.paymentMethods();

                  // Check the response...
                  if (coinbaseResponse(response, 'API.coinbase.paymentMethods()')) {
                    // Extract the payment ID and check that it is valid
                    if (fills.paymentId = response.filter(paymentMethod => new RegExp((orders.deposit?.source || DEFAULT.DEPOSIT.SOURCE), 'i').test(paymentMethod.name))?.[0]?.id) {
                      // Attempt to make the deposit...
                      const deposit = {
                        payment_method_id: fills.paymentId,
                        amount: round(fills.amountToDeposit),
                        currency: (orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY)
                      };

                      response = {};//(await API.coinbase.deposits.paymentMethod(deposit));

                      // Check the response...
                      if (coinbaseResponse(response, `API.coinbase.deposits.paymentMethod('${orders.deposit?.source}')`)) {
                        logger.log({
                          type: LOG_TYPE.INFO,
                          message: `Deposit for ${currencyPrefix[(orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY)]}${deposit.amount} ${deposit.currency} from ${(orders.deposit?.source || DEFAULT.DEPOSIT.SOURCE)} successful.`,
                          data: response
                        });                        
                      }
                    } else { // No payment method
                      logger.log({
                        type: LOG_TYPE.ERROR,
                        message: `No payment method found matching name '${orders.deposit?.source}'`,
                        data: orders.deposit
                      });
                    }
                  }
                }

                // Wait until the funds are available
                let counter = 5;
                while(counter-- && await sleep(1000)){
                  if (coinbaseResponse(response = await API.coinbase.accounts(), 'API.coinbase.accounts()')) {
                    if(response.find(({ currency }) => currency == orders.deposit?.currency)?.available >= round(fills.amountToDeposit)) break;
                  }
                }

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

                    response = {};//(await API.coinbase.placeOrder(order));
                    
                    const currency = (orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY);
                    const prefix = currencyPrefix[currency];

                    // Check the response...
                    if (coinbaseResponse(response, `API.coinbase.placeOrder('${product})'`)) {
                      // Success, add the information to the log.
                      logger.log({
                        type: LOG_TYPE.INFO,
                        //message: `Placed ${order.type} ${order.side} order for ${order.size} ${order.product_id} at price ${currencyPrefix[(orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY)]}${round(order.price, 0.01)} ${(orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY)}.`,
                        message: `Spent ${prefix}${round(order.size * order.price)} ${currency} on ${product} (${order.type} ${order.side} order for ${order.size} at price ${prefix}${round(order.price)} ${currency})`,
                        data: response
                      });
                    }
                  }
                }
              }
            } else { // Invalid amount to deposit
              logger.log({
                type: LOG_TYPE.ERROR,
                message: `Invalid amount to deposit (${prefix}${fills.amountToDeposit} ${currency}).`,
                data: {
                  amount: fills.amountToDeposit,
                  deposit: orders?.deposit
                }
              });
            }
          } else {
            logger.log({
              type: LOG_TYPE.ERROR,
              message: `Calculated amount to deposit (${prefix}${fills.amountToDeposit} ${currency}) is too high.`,
              data: account
            });
          }
        }
      }

    } else {
      // Missing something...
      //context.res = { status: 401 };
      context.status = 401;
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
    //context.res = { status: 500 };
    context.status = 500;
    logger.log({
      type: LOG_TYPE.ERROR,
      message: `Exception caught: ${error.message}`,
      data: JSON.parse(JSON.stringify(error))
    });
  }

  //(context.res = context.res || { status: 200 }).body = {
  //  log: logger.get()
  //};

  context.status = context.status || 200;
  context.res.status(context.status).json({
    log: logger.get()
  });
};
