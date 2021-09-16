/**
 * Build: node --inspect node_modules/@google-cloud/functions-framework --target=dailyBuy
 * Deploy: gcloud functions deploy dailyBuy --trigger-http --runtime nodejs14 --allow-unauthenticated
 */

const API = {
  coinbase: require('./common/coinbase'),
  google: require('./common/google')
};
const { LOG_TYPE, Logger } = require('./common/logger');

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
  return new Promise(resolve => setTimeout(() => { resolve(true) }, ms));
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
 * Helper function to extract named params from either the POST body, or the 
 * query string of a GET request.
 * 
 * @param {Request} req 
 *  Request object from HTTP trigger.
 * @param {string} param
 *  Name of param to be extracted from query.
 * @returns {any}
 *  Returns any value sent for the param.
 */
function getParam(req, param) {
  try {
    return ((req?.body?.[param]) || (req?.query?.[param] && JSON.parse(decodeURIComponent(req.query[param]))));
  } catch {
    try {
      return ((req?.body?.[param]) || (req?.query?.[param] && decodeURIComponent(req.query[param])));
    } catch {
      return null;
    }
  }
}

/**
 * 
 * @param {Request} req 
 *  Request object from HTTP trigger.
 * @param {Response} res 
 *  Response object to control interaction with HTTP client
 */
exports.dailyBuy = async function (req, res) {
  const context = { res: res };

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
  const coinbase = getParam(req, 'coinbase');
  const google = getParam(req, 'google');
  const orders = getParam(req, 'orders');
  const overrides = getParam(req, 'overrides');

  const logger = new Logger();

  // Helper variables
  const currency = (orders?.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY);
  const prefix = currencyPrefix[currency];

  // Initialize the fills object, which will be used to track calculations
  // and amounts for products.
  const fills = {
    totalWeight: 0,
    amountToDeposit: 0
  };

  try {
    // Check all required params are available
    if (coinbase?.key && coinbase?.passphrase && coinbase?.secret) {
      // Everything is at least available, attempt the workflow.
      API.coinbase.init(coinbase.key, coinbase.passphrase, coinbase.secret);

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
                    message: `Account already has ${currencyPrefix[account?.currency]}${round(account?.available, 0.01).toFixed(2)} ${account?.currency} available, no need to deposit additional funds.`,
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
                          message: `Deposit for ${prefix}${deposit.amount.toFixed(2)} ${deposit.currency} from ${(orders.deposit?.source || DEFAULT.DEPOSIT.SOURCE)} successful.`,
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
                while (counter-- && await sleep(1000)) {
                  if (coinbaseResponse(response = await API.coinbase.accounts(), 'API.coinbase.accounts()')) {
                    if (response.find(({ currency }) => currency == orders.deposit?.currency)?.available >= round(fills.amountToDeposit)) break;
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

                    // Check the response...
                    if (coinbaseResponse(response, `API.coinbase.placeOrder('${product})'`)) {
                      // Success, add the information to the log.
                      logger.log({
                        type: LOG_TYPE.INFO,
                        //message: `Placed ${order.type} ${order.side} order for ${order.size} ${order.product_id} at price ${currencyPrefix[(orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY)]}${round(order.price, 0.01)} ${(orders.deposit?.currency || DEFAULT.DEPOSIT.CURRENCY)}.`,
                        message: `Spent ${prefix}${round(order.size * order.price).toFixed(2)} ${currency} on ${product} (${order.type} ${order.side} order for ${order.size} at price ${prefix}${round(order.price).toFixed(2)} ${currency})`,
                        data: response
                      });
                    }
                  }
                }
              }
            } else { // Invalid amount to deposit
              logger.log({
                type: LOG_TYPE.ERROR,
                message: `Invalid amount to deposit (${prefix}${fills.amountToDeposit.toFixed(2)} ${currency}).`,
                data: {
                  amount: fills.amountToDeposit,
                  deposit: orders?.deposit
                }
              });
            }
          } else {
            logger.log({
              type: LOG_TYPE.ERROR,
              message: `Calculated amount to deposit (${prefix}${fills.amountToDeposit.toFixed(2)} ${currency}) is too high.`,
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

  context.res.set({ 'Access-Control-Allow-Origin': '*' });
  context.status = context.status || 200;
  context.res.status(context.status).json({
    log: logger.get(),
    summary: {
      spent: `${prefix}${round(orders.products.reduce((total, {product}) => total + ((fills[product]?.amountToBuy || 0) * (fills[product]?.adjustedPrice || 0)), 0)).toFixed(2)} ${currency}`,
      deposited: `${prefix}${round(fills.amountToDeposit).toFixed(2)} ${currency}`
    }
  });

  context.res.end();
};

/**
 * 
 * @param {Request} req 
 *  Request object from HTTP trigger.
 * @param {Response} res 
 *  Response object to control interaction with HTTP client
 */
exports.cryptoStats = async function (req, res) {
  const context = {
    res: res,
    status: null
  };

  // Get params from the request
  const coinbase = getParam(req, 'coinbase');
  const google = getParam(req, 'google');
  const products = getParam(req, 'products');

  // Logger instance to track execution.
  const logger = new Logger();

  // Initialize the fills object, which will be used to track calculations
  // and amounts for products.
  let info = {};

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
              (info[fill.product]?.fills || (info[fill.product] = { fills: [] }).fills).push(fill);
            }
          });
        }
      }

      // Iterate through all products in the order list
      for (const product of products) {
        // Get all coinbase fills for this product
        let coinbaseFills = (await API.coinbase.fills(product));

        if (Array.isArray(coinbaseFills)) {
          coinbaseFills.forEach(fill => {
            (info[fill.product_id]?.fills || (info[fill.product_id] = { fills: [] }).fills).push(fill);
          });
        }

        // Reference to the current product fills.
        const current = info[product];

        if (!current?.fills?.length) continue;

        // Get current coinbase product info
        current.product = (await API.coinbase.products(product));
        current.stats = (await API.coinbase.products.stats(product));

        // Calculate total amount bought
        current.totalAmount = current.fills
          ?.filter((fill) => /buy/i.test(fill.side))
          ?.reduce((total, fill) => {
            return Number(total) + Number(fill.size);
          }, 0);
        // Calculate total cost for this product
        current.totalCost = current.fills
          ?.filter((fill) => /buy/i.test(fill.side))
          ?.reduce((total, fill) => Number(total) + (Number(fill.price) * Number(fill.size)), 0);
        // Calculate average price per unit of this product
        current.averageCost = current.totalCost / current.totalAmount;

        // Determine the timestamp of the last purchase
        current.latest = current.fills
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

        current.fills = null;
      }

    } else {
      // Missing something...
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
    context.status = 500;
    logger.log({
      type: LOG_TYPE.ERROR,
      message: `Exception caught: ${error.message}`,
      data: JSON.parse(JSON.stringify(error))
    });
  }

  context.res.set({ 'Access-Control-Allow-Origin': '*' });
  context.status = context.status || 200;
  context.res.status(context.status).json({
    log: logger.get(),
    data: info
  });

  context.res.end();
};