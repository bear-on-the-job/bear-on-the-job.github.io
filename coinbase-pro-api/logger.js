/**
 * Const enum for logging message types
 */
const LOG_TYPE = {
  INFO: "INFO",
  ERROR: "ERROR"
};

class Logger {
  constructor() {
    this.content = [];
  }
  
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
}

module.exports = {
  LOG_TYPE,
  Logger
};