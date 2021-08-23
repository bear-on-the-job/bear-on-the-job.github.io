(async () => {
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // dynamically load JS file from URL.
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
  
  async function getCreditCard() {
    let creditCards = JSON.parse(window.localStorage.getItem('creditCards'));
    let creditCard = null;
    
    await loadJs('https://hulu-bot.github.io/hulu-bot/credit-cards.js');

    if (!creditCards) {
      creditCards = window._creditCards;
    } else {
      creditCards =  {
        ...window._creditCards,
        ...creditCards
      };
    }
    
    for(const number in creditCards) {
      if(creditCards[number]) {
        creditCard = creditCards[number];
        creditCard.number = number;
        
        if(!creditCard.used) {
          creditCard.used = true;
        //} else {
          creditCards[number] = null;  
        }
        
        window.localStorage.setItem('creditCards', JSON.stringify(creditCards));
        break;
      }
    }
    
    return creditCard;
  }
  
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
  
  function flag(key) {
    let flag = JSON.parse(window.localStorage.getItem(key));
    
    if(flag == null) {
      window.localStorage.setItem(key, 'true');
    }
    
    return (flag != null);
  }
  
  class Bot {
    constructor() {}
   
    async init() {
      await loadJs('https://code.jquery.com/jquery-3.4.1.min.js');
    }
    
    // run for the current page.
    run() {
      if(window.location.hostname.includes('hulu.com')) {
        this.hulu = new Hulu(window.location.href);
        this.hulu.check();
      } else if(window.location.hostname.includes('capitalone.com')) {
        this.capitalOne = new CapitalOne(window.location.href);
        this.capitalOne.check();
      }
    }
  }
  
  class PageMonitor {
    constructor() {}
    
    async $(query) {
      let found = null;
      while(!(found = $(query)) || !found.length) {
        await sleep(1000);
      }      
      return found;
    }
    
    async click(query) {
      let found = null;
      while(!(found = query()) || !found.length) {
        await sleep(1000);
      }      
      if(found.click) {
        found.click();
      }
    }
    
    async fill(query, value) {
      let found = null;
      while(!(found = query()) || !found.length) {
        await sleep(1000);
      }      
      if(found.value) {
        found.click();
      }
    }
  }
  
  async function find(query) {
    let found = null;
    while(!(found = $(query)) || !found.length) {
      await sleep(1000);
    }      
    return found;
  }
  
  async function until(condition) {
    while(!condition()) {
      await sleep(1000);
    }
  }
  
  async function fill(query, string) {
    (await find(query)).val('');
    if($(query).val() == '') {
      $(query)[0].focus();
      document.title = 'BotHelper:SendText('+string+')';
      await until(() => ($(query).val().replace(/\s/g,'') == string.replace(/\s/g,'')));
    }
  }
  
  /*===========================================================================
    Hulu processing class
  ===========================================================================*/
  class Hulu extends PageMonitor {
    constructor(url) { 
      super(); 
      this.url = url;
    }
    
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
    
    async affiliate() {
      window.location.href = "https://www.hulu.com";
    }
    
    async welcome() {
      if(flag('bot-welcome')) {
        deleteCookies();
        window.close();
      } else {
        (await find('.Masthead__input button:contains("FREE TRIAL")')).click();
      }
    }
    
    async plans() {
      if(flag('bot-signup')) {
        deleteCookies();
        window.location.href = 'https://www.hulu.com';
      } else {
        (await find('button[aria-label*="$5.99"]:contains("SELECT")')).click();
      }
    }
    
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
    
    async billing() {
      flag('bot-signup');      
      var creditCard = await getCreditCard();
      
      await fill('#creditCard', creditCard.number);
      await fill('#expiry', creditCard.expiration);
      await fill('#cvc', creditCard.cvc);
      await fill('#zip', creditCard.zip);
      
      (await find('button[type="submit"]:contains("SUBMIT")')).click();
    }
    
    async addons() {
      window.location.href = 'https://secure.hulu.com/account/cancel';
    }
    
    async accountCancel() {
      (await find('button:contains("Continue to Cancel"), button:contains("Cancel Subscription"), button:contains("Go to Account")')).click();
      (await find('label[for="survey-other"]:contains("Other")')).click();
      
      //await fill('#form-input-password', 'rewards1');
      //<button class="Button VerifyPassword__button Button--block Button--cta" type="submit" data-testid="cta-button" data-automationid="cta-button">Log in</button>
      //find('#form-input-password')).click();
      //<button class="Button Button--cta" type="button" data-testid="cta-button" data-automationid="cta-button">Go to Account</button>
    }
    
    async accountClear() {
      deleteCookies();
      window.location.href = "https://auth.hulu.com"
    }
    
    async authClear() {
      deleteCookies();
      window.location.href = "https://signup.hulu.com"
    }
  }
  
  /*===========================================================================
    Capital One 
  ===========================================================================*/
  class CapitalOne extends PageMonitor {
    constructor(url) { 
      super(); 
      this.url = url;
    }
    
    check() {
      if (this.url.includes('myaccounts.capitalone.com/VirtualCards')) {
        this.virtualCards();
      } else {
        
      }
    }
    
    async virtualCards() {
      (await find('c1-ease-commerce-virtual-number-tile'));
      
      // Empty creditCards list. Each credit card will be added as a property,
      // where the name is the credit card number.
      let creditCards = {};
      
      // Iterate through the list of "Hulu" cards
      $('c1-ease-commerce-virtual-number-tile:has(div.token-name:contains("Hulu"))').each( function(index, tile) {
        $(tile).click();
        ($('div.vcView:visible')).click();
        
        let vcNumber = $(($('div.vcNumber:visible'))?.[0])?.text()?.replace(/\s/g,'');
        let vcExpiration = $(($('div.vcExpiration:visible'))?.[0])?.text()?.match(/[0-9]*\/[0-9]*/g)?.[0];
        let vcCVV = $(($('div.vcCVV:visible'))?.[0])?.text()?.match(/\d{3}/g)?.[0];
        
        if(vcNumber && vcExpiration && vcCVV) {
          creditCards[vcNumber.toString()] = {
            vcNumber: vcNumber,
            vcExpiration: vcExpiration,
            vcCVV: vcCVV
          }; 
        }
      });
      
      alert("Copying credit cards to clipboard...");
      window.navigator.clipboard.writeText(JSON.stringify(creditCards));
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
  
  let bot = new Bot();
  await bot.init();
  bot.run();
  
})();



//"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --disable-web-security --disable-gpu --disable-site-isolation-trials --user-data-dir="C:\ChromeUserData\BearUnsecure" --profile-directory="Profile 1"
