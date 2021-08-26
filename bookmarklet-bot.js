(async () => {
  /**
   * ==========================================================================
   * Helper functions
   * ==========================================================================
   */

  /**
   * Use with await to sleep specified milliseconds before proceeding.
   * @param {number} ms 
   *  Number of milliseconds to sleep
   * @returns {Promise}
   *  Promise for completion.
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 
   * @param {*} min 
   * @param {*} max 
   * @returns 
   */
  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * Dynamically load JS file from URL.
   * 
   * @param {string} src 
   *  URL of the script file to be loaded.
   * @returns {Promise}
   *  Promise for completion.
   */
  function loadJs(src){
    return new Promise(resolve => {
      let head = document.head || document.getElementsByTagName('head')[0];
      let script = document.createElement('script');

      script.onreadystatechange = script.onload = () => resolve();
      script.src = src;
      script.type = 'text/javascript';

      head.insertBefore(script, head.firstChild);
    });
  }
  
  /**
   * 
   */
  function deleteCookies() {
    var cookies = document.cookie.split("; ");
    for (var c = 0; c < cookies.length; c++) {
        var d = window.location.hostname.split(".");
        while (d.length > 0) {
            var cookieBase = encodeURIComponent(cookies[c].split(";")[0].split("=")[0]) + '=; expires=Thu, 01-Jan-1970 00:00:01 GMT; domain=' + d.join('.') + ' ;path=';
            var p = location.pathname.split('/');
            document.cookie = cookieBase + '/';
            while (p.length > 0) {
                document.cookie = cookieBase + p.join('/');
                p.pop();
            };
            d.shift();
        }
    }
    
    let creditCards = JSON.parse(window.localStorage.getItem('creditCards'));
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('creditCards', JSON.stringify(creditCards));
  }
  
  /**
   * 
   * @param {*} key 
   * @returns 
   */
  function flag(key) {
    let flag = JSON.parse(window.localStorage.getItem(key));
    
    if(flag == null) {
      window.localStorage.setItem(key, 'true');
    }
    
    return (flag != null);
  }


  /**
   * 
   * @param {*} query 
   * @returns 
   */
   async function find(query) {
    let found = null;
    while(!(found = $(query)) || !found.length) {
      await sleep(1000);
    }      
    return found;
  }
  
  /**
   * 
   * @param {*} condition 
   */
  async function until(condition) {
    while(!condition()) {
      await sleep(1000);
    }
  }
  
  /**
   * 
   * @param {*} query 
   * @param {*} string 
   */
  async function fill(query, string) {
    (await find(query)).val('');
    if($(query).val() == '') {
      $(query)[0].focus();
      document.title = 'BotHelper:SendText('+string+')';
      await until(() => ($(query).val().replace(/\s/g,'') == string.replace(/\s/g,'')));
    }
  }

  /**
   * 
   */
  async function clearCookies() {
    let title = document.title;
    document.title = 'BotHelper:ClearCookies()';
    //await until(() => document.title.includes('Updated'));
    await sleep(1000);
    document.title = title;
  }


  /**
   * ==========================================================================
   * Class to manage access to credit card info from google sheets
   * ==========================================================================
   */
  class CreditCards {
    constructor() {}
    /**
     * Constant values used for access GAPI
     */
    GOOGLE_SHEETS = {
      API_KEY: 'AIzaSyBk_FWoW20vypS3rSFIfqlPTKaCqgljXgA',
      CLIENT_ID: '95001606064-pug02tqd88fpqjebti5ono3r7tnu99d4.apps.googleusercontent.com',
      DISCOVERY_DOCS: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
      // Authorization scopes required by the API; multiple scopes can be
      // included, separated by spaces.
      SCOPES: "https://www.googleapis.com/auth/spreadsheets",
      SHEET_ID: '1TtpXHXcIl0o6ibEIHZwiH6_4p-ZpjBboYjCq6TSdQSI',
      RANGE: 'CreditCards!A2:D',
      ROW: {
        NUMBER: 0,
        EXPIRATION: 1,
        CCV: 2,
        ZIP: 3
      }
    }
    
    /**
     * Initialize the CreditCards object by setting up GAPI and authenticating
     */
    async init () {
      await loadJs('https://apis.google.com/js/api.js');

      const GOOGLE_SHEETS = this.GOOGLE_SHEETS;

      const signinStatus = async function (isSignedIn) { 
        if(!isSignedIn){
          gapi.auth2.getAuthInstance().signIn();
        } else {
          // Do nothing...
        }
      };

      await (new Promise(resolve => {
        gapi.load('client:auth2', function () {
          gapi.client.init({
            apiKey: GOOGLE_SHEETS.API_KEY,
            clientId: GOOGLE_SHEETS.CLIENT_ID,
            discoveryDocs: GOOGLE_SHEETS.DISCOVERY_DOCS,
            scope: GOOGLE_SHEETS.SCOPES
          }).then(async function () {
            // Listen for sign-in state changes.
            gapi.auth2.getAuthInstance().isSignedIn.listen(signinStatus);
            // Handle the initial sign-in state.
            await signinStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
            resolve();
          }, function(error) {
            console.log(JSON.stringify(error, null, 2));
            resolve();
          });
        });
      }));
    }

    /**
     * Loads all credit cards from google sheet
     * 
     * @returns {Promise<Array<object>}
     *  Array of credit cards
     */
    _loadCreditCards () {
      const GOOGLE_SHEETS = this.GOOGLE_SHEETS;

      return new Promise(resolve => {
        gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: GOOGLE_SHEETS.SHEET_ID,
          range: GOOGLE_SHEETS.RANGE,
        }).then(function(response) {
          var range = response.result;
          var creditCards = [];
          for (const row of range.values ?? []) {
            creditCards.push({
              number: row[GOOGLE_SHEETS.ROW.NUMBER],
              expiration: row[GOOGLE_SHEETS.ROW.EXPIRATION],
              ccv: row[GOOGLE_SHEETS.ROW.CCV],
              zip: row[GOOGLE_SHEETS.ROW.ZIP],
            });
          }
          resolve(creditCards);
        }, function(response) {
          console.log('Error: ' + response.result.error.message);
          resolve([]);
        });
      })
    };

    /**
     * Clears (NOT deletes) the cells specified
     * 
     * @param {string} range 
     *  Spreadsheet notation for the cells to be updated.
     * @returns {Promise<boolean>}
     *  True for success, false for failure.
     */
    _clearRows (range) {
      const GOOGLE_SHEETS = this.GOOGLE_SHEETS;

      return new Promise(resolve => {
        // Works to clear the cells, but not delete them...
        gapi.client.sheets.spreadsheets.values.clear({
          spreadsheetId: GOOGLE_SHEETS.SHEET_ID,
          range: range,
        }).then(function(response) {
          console.log(`Cleared:\n${JSON.stringify(response)}`);
          resolve(true);
        }, function(response) {
          console.log(`Error: ${response.result.error.message}`);
          resolve(false);
        });
      });
    }

    /**
     * Deletes the range of rows specified. Note: end must always
     * be at least 1 greater that start, even if one row is being
     * deleted.
     * 
     * @param {number} start 
     *  Starting row to delete.
     * @param {number} end 
     *  Row following the last row to delete.
     * @returns {Promise<boolean>}
     *  True for success, false for failure.
     */
    _deleteRows (start, end) {
      const GOOGLE_SHEETS = this.GOOGLE_SHEETS;

      // build request based on start an end. 
      const requests = [
        {
          deleteDimension: {
            range: {
              sheetId: 0, // Always use sheet 0.
              dimension: "ROWS",
              startIndex: start,
              endIndex: end
            }
          }
        }
      ];

      return new Promise(resolve => {
        gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: GOOGLE_SHEETS.SHEET_ID,
          resource: {requests: requests}
        }).then((response) => {
          console.log(`Batch Update:\n${JSON.stringify(response)}`);
          resolve(true);
        }, (response) => {
          console.log(`Error: ${response.result.error.message}`);
          resolve(false);
        });
      });
    }

    /**
     * 
     * @param {Array} columns 
     *  Array of values to be added as the columns for this row.
     * @returns {Promise<boolean>}
     *  True if success, false if failure.
     */
    _addRow (columns) {
      const GOOGLE_SHEETS = this.GOOGLE_SHEETS;

      // build request based on start an end. 
      const values = [
        columns
      ];

      return new Promise(resolve => {
        gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: GOOGLE_SHEETS.SHEET_ID,
          range: 'A1:D1',
          valueInputOption: 'USER_ENTERED',
          resource: {values: values}
        }).then((response) => {
          console.log(`Batch Update:\n${JSON.stringify(response)}`);
          resolve(true);
        }, (response) => {
          console.log(`Error: ${response.result.error.message}`);
          resolve(false);
        });
      });
    }

    /**
     * Gets one credit card from google sheet, and immediately deletes
     * it from the sheet so it can't be reused again.
     * 
     * @returns {object}
     *  Credit card object including number, expiry, CCV
     */
    async get () {
      var result = (await this._loadCreditCards())?.[0];
      await this._deleteRows(1,2);
      return result;
    }

    /**
     * Adds a new credit card to the google sheet
     * 
     * @param {object} creditCard 
     *  New credit card object to be added.
     * @returns {Promise<boolean>}
     *  True if success, false if failure.
     */
    async add (creditCard) {
      const columns = [
        creditCard?.number,
        creditCard?.expiration,
        creditCard?.ccv,
        creditCard?.zip ?? '11214'
      ];

      return await this._addRow(columns);
    }

    /**
     * Deletes the whole sheet
     * 
     * @returns {Promise<boolean>}
     *  True if success, false if failure.
     */
    async clear () {
      return await this._deleteRows(1);
    }
  }

  /**
   * ==========================================================================
   * Class to invoke bot for different sites
   * ==========================================================================
   */
  class Bot {
    constructor() {}
   
    async init() {
      await loadJs('https://code.jquery.com/jquery-3.4.1.min.js');
    }
    
    // run for the current page.
    run() {
      if(window.location.hostname.includes('hulu.com')) {
        this.hulu = new Hulu(window.location.href);
        //this.hulu.check();
      } else if(window.location.hostname.includes('capitalone.com')) {
        this.capitalOne = new CapitalOne(window.location.href);
        this.capitalOne.check();
      }
    }
  }
  
  
  /**
   * ==========================================================================
   * Hulu processing class
   * ==========================================================================
   */
  class Hulu {
    constructor(url) { 
      this.url = url;
    }
    
    /**
     * Main function to determine which page processor to call
     */
    check() {
      if (this.url.includes('hulu.com/start/affiliate?')) {
        this.affiliate();
      } else if (this.url.includes('hulu.com/welcome')) {
        this.welcome();
      } else if (this.url.includes('signup.hulu.com/plans')) {
        this.plans();
      } else if (this.url.includes('signup.hulu.com/account')) {
        this.account();
      } else if (this.url.includes('signup.hulu.com/billing')) {
        this.billing();
      } else if (this.url.includes('secure.hulu.com/account/addons')) {
        this.addons();
      } else if (this.url.includes('secure.hulu.com/account/cancel')) {
        this.accountCancel();
      } else if (this.url.includes('secure.hulu.com/account')) {
        this.accountClear();
      } else if (this.url.includes('auth.hulu.com')) {
        this.authClear();
      } else {
        
      }
    }
    
    /**
     * 
     */
    async affiliate() {
      window.location.href = "https://www.hulu.com";
    }
    
    /**
     * 
     */
    async welcome() {
      if(flag('bot-welcome')) {
        deleteCookies();
        window.close();
      } else {
        (await find('.Masthead__input button:contains("FREE TRIAL")')).click();
      }
    }
    
    /**
     * 
     */
    async plans() {
      if(flag('bot-signup')) {
        deleteCookies();
        window.location.href = 'https://www.hulu.com';
      } else {
        (await find('button[aria-label*="$5.99"]:contains("SELECT")')).click();
      }
    }
    
    /**
     * 
     */
    async account() {
      flag('bot-signup');
      let email = 'john.smith.' + new Date().getTime() + '@loveisapolaroid.com'
      
      await fill('#email', email);
      await fill('#password', 'rewards1');
      await fill('#firstName', 'Dude');
      
      $('#birthdayMonth-item-' + getRandomInt(0,11)).click();
      $('#birthdayDay-item-' + getRandomInt(0,25)).click();
      $('#birthdayYear-item-' + getRandomInt(20,50)).click();
      $('#gender-item-2').click();
      
      (await find('.button--continue:contains("CONTINUE")')).click();      
    }
    
    /**
     * 
     */
    async billing() {
      flag('bot-signup');
      var creditCards = new CreditCards();
      await creditCards.init();
      var creditCard = await creditCards.get();
      
      await fill('#creditCard', creditCard.number);
      await fill('#expiry', creditCard.expiration);
      await fill('#cvc', creditCard.cvc);
      await fill('#zip', creditCard.zip);
      
      (await find('button[type="submit"]:contains("SUBMIT")')).click();
    }
    
    /**
     * 
     */
    async addons() {
      window.location.href = 'https://secure.hulu.com/account/cancel';
    }
    
    /**
     * 
     */
    async accountCancel() {
      (await find('button:contains("Continue to Cancel"), button:contains("Cancel Subscription"), button:contains("Go to Account")')).click();
      (await find('label[for="survey-other"]:contains("Other")')).click();
    }
    
    /**
     * 
     */
    async accountClear() {
      //deleteCookies();
      await clearCookies();
      window.location.href = "https://auth.hulu.com"
    }
    
    /**
     * 
     */
    async authClear() {
      //deleteCookies();
      await clearCookies();
      window.location.href = "https://signup.hulu.com"
    }
  }
  
  /*===========================================================================
    Capital One 
  ===========================================================================*/
  class CapitalOne {
    constructor(url) { 
      this.url = url;
    }
    
    check() {
      if (this.url.includes('myaccounts.capitalone.com/VirtualCards')) {
        if(window.deleteCards){
          this.deleteCards();
        } else {
          this.loadCards();
        }        
      } else {
        
      }
    }
    
    async loadCards() {
      var creditCards = new CreditCards();
      await creditCards.init();
      await creditCards.clear();

      (await find('c1-ease-commerce-virtual-number-tile'));
      
      // Iterate through the list of "Hulu" cards
      //$('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))').each(async function(index, tile) {

      for(const tile of $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))')) {
        (await find(tile)).click();
        (await find('div.vcView:visible')).click();

        let vcCVV = null;
        let vcNumber = null;
        let vcExpiration = null;

        let dialog = $('div.vcView:visible').parents('.c1-ease-dialog-content:visible');

        await until(() => vcCVV = $((dialog?.find('div.vcCVV:visible'))?.[0])?.text()?.match(/\d{3}/g)?.[0]);
        await until(() => vcNumber = $((dialog?.find('div.vcNumber:visible'))?.[0])?.text()?.replace(/\s/g,''));
        await until(() => vcExpiration = $((dialog?.find('div.vcExpiration:visible'))?.[0])?.text()?.match(/[0-9]*\/[0-9]*/g)?.[0]);
        
        if(vcNumber && vcExpiration && vcCVV) {
          await creditCards.add({
            number: vcNumber,
            expiration: vcExpiration,
            ccv: vcCVV,
            zip: '11214'
          }); 
        }

        (await find('.c1-ease-dialog-close-button')).click();
      }      
    }

    async deleteCards() {
      var creditCards = new CreditCards();
      await creditCards.init();
      await creditCards.clear();

      (await find('c1-ease-commerce-virtual-number-tile'));
      
      // Iterate through the list of "Hulu" cards
      //$('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))').each(async function(index, tile) {

      for(const tile of $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))')) {
        (await find(tile)).click();
        (await find('button.vc-delete-button:visible')).click();
        (await find('button.deleteButton:contains("Delete"):visible')).click();
        (await find('.c1-ease-dialog-close-button')).click();
      }      
    }
    
    /*
    $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))')[2].length
      $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))')[2].click()

      $('div.vcNumber._TLPRIVATE:contains("••••")').length

      $('div.vcView').click()

      $($('div.vcNumber')[0]).text()
      $($('div.vcExpiration')[0]).text()
      $($('div.vcCVV')[0]).text()

      $('.c1-ease-dialog-close-button').click()

    $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))')[2].length
      $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))')[2].click()
      $('button.vc-delete-button').click()
      $('button.deleteButton:contains("Delete")').click()
      $('.c1-ease-dialog-close-button').click()
    */
    
  }
  
  /**
   * ==========================================================================
   * Main execution
   * ==========================================================================
   */
  let bot = new Bot();
  await bot.init();
  bot.run();

  /*
  let creditCards = new CreditCards();
  await creditCards.init();
  await creditCards.clear();
  
  let creditCard = await creditCards.get();
  let success = await creditCards.add(creditCard);
  success = !success;
  */
  
})();

//"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --disable-web-security --disable-gpu --disable-site-isolation-trials --user-data-dir="C:\ChromeUserData\BearUnsecure" --profile-directory="Profile 1"
