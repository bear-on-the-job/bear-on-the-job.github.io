
var jq = document.createElement('script');
jq.onload = () => {
  // ... give time for script to load, then type (or see below for non wait option)
  jQuery.noConflict();   
  // Youtube TV click all the free stuff
  jQuery("div.header:has(div.ytu-onboarding-offer-info:contains('free trial')) tp-yt-paper-checkbox").click()
}
jq.src = "https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js";
document.getElementsByTagName('head')[0].appendChild(jq);
