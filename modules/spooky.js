/**
 * Spooky is a enhancement for CasperJS in coded Web UI tests.
 */
var require = patchRequire(require);
var Casper = require('casper').Casper;
var utils = require('utils');
var sutils = require('spooky_libs/selector_utils');
var fs = require('fs');
var selectXPath = require('casper').selectXPath;

//TODO: move globalization to another file.
//BEGIN: globalization
//make x to be global, and add 'append' to XPath Selector
x = function(path){
    var selector = selectXPath(path);
    selector.append = function(subX){
        return sutils.xChild(selector, subX);
    };
    return selector;
};

//globalize useful X helpers
wrapX = sutils.wrapX;
createXWrapperTree = sutils.createXWrapperTree;
createXElement = sutils.createXElement;

//make underscore to be global
_ = require("spooky_libs/underscore");

// add collectMappings to underscore
if(!_.collectMappings) {
    /**
     * Generate mappings by collection and mappingGenerator
     *     collectMappings([1,2], function(num, index){
     *          var mappings = {};
     *          mappings["num"+index+"add1"] = num + 1;
     *          mappings["num"+index+"add2"] = num + 2;
     *          return mappings;
     *     });
     *     => {num0add1:2, num0add2:3, num1add1:3, num1add2:4}
     * @param collection
     * @param mappingGenerator, generate part of mappings, accept params as iteratee in _.map does
     * @returns mappings
     */
    _.collectMappings = function (collection, mappingGenerator) {
        return _.chain(collection)
            .map(mappingGenerator)
            .reduce(function (memo, mapping) {
                return _.extend(memo, mapping);
            }, {})
            .value();
    };
}

// add mapping to underscore
if(!_.mapping) {
    /**
     * Generate single mapping
     * @param key
     * @param value
     * @returns mapping = {key: value}
     */
    _.mapping = function (key, value) {
        return _.object([key], [value]);
    };
}

/**
 * Add JavaScript Enhancement
 */
require("spooky_libs/function_curry").init();
require("spooky_libs/string_format").init();

//END: globalization

//exit codes definition
var exitCodes = {
    UNCLASSIFIED : 100,
    WAITING_STATUS_CHANGED_TIMEOUT : 101,
    UNREMAINED_CAUGHT : 102
};

var SECOND = 1000;
var DEFAULT_EVENT_BINDING_DELAY = 1 * SECOND;

function Spooky(casperOptions, spookyOptions) {
    Spooky.super_.apply(this, arguments);
    
    //Spooky options can be overridden by subclass
    var defaultSpookyOptions = {
        timeoutErrorTypes : null,
        generatePathToSaveFailureScene : null
    };
    this.spookyOptions = utils.mergeObjects(defaultSpookyOptions, spookyOptions);
}

utils.inherits(Spooky, Casper);

/**
 * add taking screenshot step
 * @param path, to save screenshot
 */
Spooky.prototype.screenshot = function(path){
    return this.then(function(){
        this.capture(path + ".png");
        fs.write(path + ".html", this.getHTML());
    });
};

/**
 * add print log step
 * @param toBeSaid
 */
Spooky.prototype.say = function(toBeSaid){
    return this.then(function(){
        this.echo(toBeSaid);
    });
};

/**
 * Fail test case with description and exitCode, also take screen shots to help debug.
 * Warning: Use it to debug but please don't use it in your case.
 * TODO:need to be refactored, remove all invocation from cases.
 * @param description
 * @param exitCode
 */
Spooky.prototype.fail = function(description, exitCode){
    if(this.spookyOptions.generatePathToSaveFailureScene){
        var path = this.spookyOptions.generatePathToSaveFailureScene.call(this);
        try {
            this.capture(path + ".png");
            fs.write(path + ".txt", description);
            fs.write(path + ".html", this.getHTML());
        }
        catch (error) {
            this.log("Fail to save screenshots and description, error:" + error.toString(), "error");
        }
    }

    this.die(description, exitCode ? exitCode : exitCodes.UNCLASSIFIED);
};

/**
 * Fail case with description when waiting something to be changed to specified status timeout.
 * User can define timeoutErrorTypes in options to return specified error code to case runner.
 * timeoutErrorTypes with data structure as a definition list = [
 *     {
 *          description : "error description",
            exitCode : "exit code should be range(200, 255) to avoid conflict with error code defined by SpookyJS",
            decisionFunction : "a function return true if the error type "
 *     },
 *     ...
 * ]
 * 
 * @param description
 * @returns {*}
 */
Spooky.prototype.waitingStatusChangedTimeoutFail = function(description){
    
    //specified fail defined by user with specified error code
    var timeoutErrorTypes = this.spookyOptions.timeoutErrorTypes;
    if(timeoutErrorTypes){
       for(var i = 0; i < timeoutErrorTypes.length; i++){
           var timeoutErrorType = timeoutErrorTypes[i];
           if(utils.isFunction(timeoutErrorType.decisionFunction) 
               && timeoutErrorType.decisionFunction.apply(this)){
               return this.fail("ErrorType: " + timeoutErrorType.description + "\n" + "Message: " + description, 
                                timeoutErrorType.exitCode);
           }
       }
    }
    
    //default failFunc with with general error code
    return this.fail(description, exitCodes.WAITING_STATUS_CHANGED_TIMEOUT);
};

/**
 * Generate function to fail case with description when waiting something to be changed to specified status timeout.
 * FIXME: Remove invocation from cases and customized waitFor*
 * @param description
 * @returns {Function}
 */
Spooky.prototype.waitingStatusChangedTimeoutFailFunc = function(description){
    var that = this;
    return function(){
        that.waitingStatusChangedTimeoutFail(description);
    };
};
 
 

/**
 * Fail case with description when catch elements can not remain their statuses by using remained* assertors.
 * @param description
 * @returns {*}
 */
Spooky.prototype.unremainedCaughtFail = function(description){
    return this.fail(description, exitCodes.UNREMAINED_CAUGHT);
};

/**
 * maintain all statusQueriers named by status
 * @type {string[]}
 */
Spooky.prototype.statusQueriers = ["existent", "inexistent", "visible", "invisible", "checked", "unchecked", "enabled", "disabled"];

/**
 * A querier checks existent for a DOM element matching a given selector expression
 */
Spooky.prototype.existent = Spooky.prototype.exists;

/**
 * A querier checks inexistent for a DOM element matching a given selector expression
 * @param selector
 * @returns {boolean}
 */
Spooky.prototype.inexistent = function(selector){
    return ! this.existent(selector);
};

/**
 * A querier checks invisible for a DOM element matching a given selector expression
 * @param selector
 * @returns {boolean}
 */
Spooky.prototype.invisible = function(selector){
    return ! this.visible(selector);
};

/**
 * A querier checks checked for a radio or checkbox element matching a given selector expression
 * @param selector
 * @returns {*|Object}
 */
Spooky.prototype.checked = function(selector){
    this.checkStarted();
    return this.visible(selector) && this.evaluate(function(selector) {
        var element = __utils__.findOne(selector);
        var checked;
        //checkbox or… radio button (weird, I know)
        if (element.hasAttribute('value')) {
            checked = element.checked ? element.getAttribute('value') : undefined;
        } else {
            checked = element.checked;
        }
        if(checked){
            return true;
        }
        return false;
    }, selector);
};

/**
 * A querier checks unchecked for a radio or checkbox element matching a given selector expression
 * @param selector
 * @returns {boolean}
 */
Spooky.prototype.unchecked = function(selector) {
    return !this.checked(selector);
};

/**
 * A querier checks enabled for a DOM element matching a given selector expression
 * @param selector
 * @returns {boolean}
 */
Spooky.prototype.enabled = function(selector){
    return !this.disabled(selector);
};

/**
 * A querier checks disabled for a DOM element matching a given selector expression
 * @param selector
 * @returns {boolean}
 */
Spooky.prototype.disabled = function(selector){
    this.checkStarted();
    var result = this.visible(selector) && this.evaluate(function(selector){
        var element = __utils__.findOne(selector);
        return element["disabled"];
    }, selector);
    if(result){
        return true;
    }
    return false;
};
 

/**
 * Click a visible element it with delay
 *
 * @param selector
 * @param [DELAY]
 * @returns Spooky
 */
Spooky.prototype.doClick = function (selector, DELAY) {
    //TODO: and option to Spooky to let user set "progress bar" like selector.
    //TODO: Rewrite waitUntilVisible to make elements logically visible but not just CSS visible.
    //TODO: We can perform action on a element only when it's logically visible.
    return this.changedToVisible(selector).wait(
            utils.isUndefined(DELAY) ? DEFAULT_EVENT_BINDING_DELAY : DELAY,
            function() {
                this.click(selector);
            });
};

/**
 * Retryable thenOpen
 *
 * @param url
 * @param [then]
 * @param [retryTimes]
 * @returns Spooky
 */
Spooky.prototype.retryableThenOpen = function(url, then, retryTimes){

    var defaultRetryTimes = 3;
    if(typeof retryTimes !== 'undefined'){
        defaultRetryTimes = retryTimes;
    }

    //hook event to retry when loading resource failed
    var retryableListener = function(response){
        if(response.url === url){
            if(defaultRetryTimes > 0){
                defaultRetryTimes = defaultRetryTimes -1;
                this.log("Opening page - {0} , {1} times left to retry".format(url, defaultRetryTimes), "debug");
                this.thenOpen(url);
            }else{
                this.waitingStatusChangedTimeoutFail("Fail to open page - {0}".format(url));
            }
        }
    };

    this.on('load.failed', retryableListener);

    return this.thenOpen(url,function loadedComplete(){
        this.log("Url loaded complete: {0}".format(url), "debug");
        this.log("Remove retryable listener", "debug");
        this.removeListener("'load.failed'", retryableListener);
        if(then){
            then.apply(this);
        }
    });
};

/**
 * Open a url
 *
 * @param url
 * @returns Spooky
 */
Spooky.prototype.doOpen = function(url){
    return this.retryableThenOpen(url);
};

/**
 * Hover a visible element.
 * @param selector
 * @param [DELAY]
 * @returns Spooky
 */
Spooky.prototype.doHover = function(selector, DELAY) {
    return this.changedToVisible(selector).wait(
            utils.isUndefined(DELAY) ? DEFAULT_EVENT_BINDING_DELAY : DELAY,
            function() {
                this.mouseEvent('mousemove', selector);
            });
};

/**
 * Input content to a visible and editable element
 *
 * @param selector
 * @param content
 * @param [DELAY]
 * @returns Spooky
 */
Spooky.prototype.doInput = function(selector, content, DELAY) {
    return this.changedToVisible(selector).wait(
            utils.isUndefined(DELAY) ? DEFAULT_EVENT_BINDING_DELAY : DELAY,
            function() {
                this.evaluate(
                    function(client_selector) {
                        var element = __utils__.findOne(client_selector);
                        if( element ){
                            element.value = "";
                        }
                        return;
                    },
                    {
                        client_selector : selector
                    }
                );

                this.sendKeys(selector, content);
            });
};

/**
 * Select a option in a dropdown
 * 
 * @param dropdownSelector,
 *            only support CSS selector now. TODO: support XPath
 * @param option,
 *            option text
 */
Spooky.prototype.doSelect = function(dropdownSelector, option, DELAY) {
    return this.changedToVisible(dropdownSelector).wait(
            utils.isUndefined(DELAY) ? DEFAULT_EVENT_BINDING_DELAY : DELAY,
            function() {
                this.evaluate(function(dropdownSelector, option) {
                    var selectedOption = document.querySelector(dropdownSelector + " option[selected='selected']").text;
                    // no need to switch
                    if (selectedOption === option) {
                        return true;
                    }

                    var options = document.querySelectorAll(dropdownSelector
                            + " option");
                    // find option index
                    for ( var i = 0; i < options.length; i++) {
                        if (option === options[i].text) {
                            break;
                        }
                    }
                    // set index
                    document.querySelector(dropdownSelector).selectedIndex = i;

                    // trigger 'change' event
                    var event = document.createEvent("HTMLEvents");
                    event.initEvent("change", true, true);
                    document.querySelector(dropdownSelector).dispatchEvent(event);
                    return true;
                }, {
                    dropdownSelector : dropdownSelector,
                    option : option
                });
            });
};

//TODO: add comments
Spooky.prototype.evaluateSelectorMapIfLazy = function(selectorMap){
    var spooky = this;
    return _.collectMappings(selectorMap, function(selector, selectorName){
        if(sutils.isSingleSelector(selector)){
            return _.mapping(selectorName, selector);
        }else if(sutils.isLazySelectors(selector)){
            var evaluatedSingleSelector = selector.apply(spooky);
            if(! sutils.isSingleSelector(evaluatedSingleSelector)){
                throw new CasperError("We only support lazy selector evaluate to a single selector in selector map, " +
                    "but not this one - {0} evaluate to {1}".format(selectorName, evaluatedSingleSelector.toString()));
            }
            return _.mapping(selectorName, evaluatedSingleSelector);
        }else{
            throw new CasperError("We only support such selectors in selector map: 1.single selector; 2.lazy selector which will evaluate to a single selector. "+
                "But not this one - {0} in selector map - {1}".format(selectorName, selectorMap.toString()));
        }
    });
};

//TODO: add comments
Spooky.prototype.evaluateSelectorListIfLazy = function(selectorList){
    var spooky = this;
    return _(selectorList).map(function(selector){
        if(sutils.isSingleSelector(selector)){
            return selector;
        }else if(sutils.isLazySelectors(selector)){
            var evaluatedSingleSelector = selector.apply(spooky);
            if(! sutils.isSingleSelector(evaluatedSingleSelector)){
                throw new CasperError("We only support lazy selector evaluate to a single selector in selector list, " +
                    "but not this one - {0} evaluate to {1}".format(selector.toString(), evaluatedSingleSelector.toString()));
            }
            return evaluatedSingleSelector;
        }else{
            throw new CasperError("We only support such selectors in selector list: 1.single selector; 2.lazy selector which will evaluate to a single selector. "+
                "But not this one - {0} in selector list - {1}".format(selector.toString(), selectorList.toString()));
        }
    });
};

//TODO: add comments
Spooky.prototype.evaluateIfLazy = function(selectors){
    var _selectors = selectors;
    if( sutils.isLazySelectors(_selectors) ){
        _selectors = selectors.apply(this);
    }

    if(sutils.isSingleSelector(_selectors)){
        return _selectors;
    }else if( sutils.isSelectorList(_selectors) ) {
        return this.evaluateSelectorListIfLazy(_selectors);
    } else if( sutils.isSelectorMap(_selectors) ){
        return this.evaluateSelectorMapIfLazy(_selectors);
    } else{
        throw new CasperError('Unsupported selectors - {0}'.format(_selectors.toString()));
    }
};

/**
 * Generate a specified status reporter for selectors.
 * 1.Log error level message if a selector isn't in specified status;
 * 2.Log debug level message if a selector is in specified status.
 * @param status
 * @param selectors
 * @param logTag
 * @returns {reporter}
 */
Spooky.prototype.newSingleStatusReporter = function(status, selectors, logTag){
    var spooky = this;

    var report = function(selector, selectorAlias){
        var selectorString = selector.toString();
        if(typeof selectorAlias !== "undefined"){
            selectorString = "{0} - {1}".format(selectorAlias, selectorString);
        }

        if(spooky[status](selector)){
            spooky.log("{0}[ThisIsWhatWeWant] {1}".format(logTag, selectorString), "debug");
        }else{
            spooky.log("{0}[WeDoNotWantThis] {1}".format(logTag, selectorString), "error");
        }
    };
    return function reporter(){
        var _selectors = spooky.evaluateIfLazy(selectors);
        if (sutils.isSingleSelector(_selectors)){
            report(_selectors);
        }else if(sutils.isSelectorList(_selectors) || sutils.isSelectorMap(_selectors)) {
            _.each(_selectors, report);
        }else{
            throw new CasperError('There is no way for this line being executed');
        }
    };
};

//TODO:add comments
Spooky.prototype.newChecker = function(xx, selectors, are, status){
    var spooky = this;
    var isMet = function(selector){
        var yes = spooky[status](selector);
        return are ? yes: !yes;
    };
    if(sutils.isSupportedSelectors(selectors)){
        return function checker() {
            var _selectors = spooky.evaluateIfLazy(selectors);

            if (sutils.isSingleSelector(_selectors)){
                return isMet(_selectors);
            }else if(sutils.isSelectorList(_selectors) || sutils.isSelectorMap(_selectors)) {
                return xx(_selectors, isMet);
            }else {
                throw new CasperError('There is no way for this line being executed');
            }
        };
    }else{
        throw new CasperError('Unsupported selectors - {0}'.format(selectors.toString()));
    }
};

/**
 * Generate checker to monitor is there every selector has been changed to specified status.
 * Checker return true if all selectors are changed to specified status; return false if not.
 *
 * @param changedToStatus
 * @param selectors, either a single selector, a map or a list, or even a function to generate selectors
 * @returns {checker}
 */
Spooky.prototype.newChangedToChecker = function(changedToStatus, selectors){
    var are = true;
    return this.newChecker(_.every, selectors, are, changedToStatus);
};

/**
 * Generate checker to monitor is there any selector can not remained its status.
 * Checker return true if any selector can't remain specified status; return false if not.
 *
 * @param statusToRemained
 * @param selectors, either a single selector, a map or a list, or even a function to generate selectors
 * @returns {checker}
 */
Spooky.prototype.newUnremainedChecker = function(statusToRemained, selectors){
    var arenot = false;
    return this.newChecker(_.some, selectors, arenot, statusToRemained);
};


/**
 * Generate assertor name by following rule:
 * If a status                  is       "visible",
 *      assertor family         is       "changedTo",
 *      then  -->
 *      generated assertor name is       "changedToVisible"
 * @param assertorFamily
 * @param status
 * @returns {string}
 * @private
 */
var _getAssertorName = function(assertorFamily, status){
    return assertorFamily + status[0].toUpperCase() + status.slice(1);
};

/**
 * Generate changedTo* assertors for every status querier in Spooky.prototype.statusQueriers.
 * ChangedTo* assertors can be used to verify whether selectors are changed to expected status or not.
 * If there is a selector cannot br changed to expected status, fail the case.
 *
 */
Spooky.prototype.statusQueriers.forEach(function(status){
    var assertorName = _getAssertorName("changedTo", status);
    Spooky.prototype[assertorName] = function(selectors, timeout){
        var reporter = this.newSingleStatusReporter(status, selectors, "[Assertor:{0}]".format(assertorName));
        return this.waitFor(
          this.newChangedToChecker(status, selectors),
          function thatIsWhatWeWant(){
            reporter.apply(this);
          },
          function weDoNotWantThis(){
            reporter.apply(this);
            this.waitingStatusChangedTimeoutFail("Not all selectors' statuses are changed to expected one, please check logs above and fix it.");
          },
          timeout);
    };
});

/**
 * Generate remained* assertors for every status querier in Spooky.prototype.statusQueriers.
 * Remained* assertors can be used verify whether selectors status are remained unchanged or not.
 * If there is a selector cannot remain its status, fail the case.
 */
Spooky.prototype.statusQueriers.forEach(function(status){
    var assertorName = _getAssertorName("remained", status);
    Spooky.prototype[assertorName] = function(selectors, timeout){
        var reporter = this.newSingleStatusReporter(status, selectors, "[Assertor:{0}]".format(assertorName));
        return this.waitFor(
          this.newUnremainedChecker(status, selectors),
          function weCatchSomeUnremainedStatusSelectors(){
            reporter.apply(this);
            this.unremainedCaughtFail("Not all selectors' statuses remained unchanged, it seems we catch a bug! Please check logs above and fix it");
          },
          function allOfSelectorsRemainedStatus(){
            reporter.apply(this);
          },
          timeout);
    };
});
 

/**
 * Generate tester to test check selectors' statuses changing.
 * If all selectors' statues are changed to expected one, return true; return false if not.
 *
 * @param changedToStatues: collection of selectors and their status
 * statues = {
 *   visible: selectors,
 *   invisible : selectors,
 *   checked : selectors,
 *   unchecked : selectors,
 *   ...
 * }
 * @returns {tester}
 */
Spooky.prototype.newChangedToTester = function(changedToStatues){
    var that = this;
    var tester = function(){
        var statusQueriers = _.keys(changedToStatues);
        return _.every(statusQueriers, function(querier){
            var selectors = changedToStatues[querier];
            return that.newChangedToChecker(querier, selectors)();
        });
    };
    return tester;
};

/**
 * Generate test function to catch selectors with their status can't remained unchanged.
 * If one of selector's status can't remained unchanged, return true; return false if not.
 *
 * @param statuesToRemained: collection of selectors and their status
 * statues = {
 *   visible: selectors,
 *   invisible : selectors,
 *   checked : selectors,
 *   unchecked : selectors,
 *   ...
 * }
 * @returns {catcher}
 */
Spooky.prototype.newUnremainedCatcher = function(statuesToRemained){
    var that = this;
    var catcher = function(){
        var statusQueriers = _.keys(statuesToRemained);
        return _.some(statusQueriers, function(querier){
            var selectors = statuesToRemained[querier];
            return that.newUnremainedChecker(querier, selectors).apply(that);
        });
    };
    return catcher;
};

/**
 * Generate a reporter for a assertor.
 * Log error message if a selector's status satisfies assertor; Log debug message if it does.
 *
 * @param statuses: collection of selectors and their status
 * statuses = {
 *   visible: selectors,
 *   invisible : selectors,
 *   checked : selectors,
 *   unchecked : selectors,
 *   ...
 * }
 * @param assertorName
 * @returns {reporter}
 */
Spooky.prototype.newStatusesReporter = function(statuses, assertorName){
    var that = this;
    var reporter = function(){
        _.each(statuses, function(selectors, statusQuerier){
            that.newSingleStatusReporter(
              statusQuerier,
              selectors,
              "[Assertor:{0}][Querier:{1}]".format(assertorName, statusQuerier)
            ).apply(that);
        });
    };

    return reporter;
};

/**
 * Verify elements' statuses changing, case go on if it happens; fail if not.
 *
 * We are patiently wait for changing until we lost our patient. If timeout, we think there maybe a bug or there may not.
 * Something network failure, computing resource shortage or perform action on elements before event binding complete
 * may lead to timeout. In this circumstance, we don't think our case is failed. Instead, we think we need to rerun such case,
 * give it one more chance in case runner but not in this javascript test framework.
 *
 * @param changing, changingTestFunction or changedToStatuses:
 * 1. If you want to use this, please read it carefully. Do not use it if you are not fully understand it. A complex
 *    changing verification may be very complicated that we can't express in changedToStatuses. So we need to use test
 *    function to verify it,test function return true if all things are changed to expected status, false if not.
 *
 * 2. changedToStatuses, a collection of selectors and their status
 *  = {
 *   visible: selectors,
 *   invisible : selectors,
 *   checked : selectors,
 *   unchecked : selectors,
 *   ...
 * }
 * @param timeout
 * @returns Spooky
 */
Spooky.prototype.changedTo = function(changing, timeout){

    if (utils.isFunction(changing)){
        return this.waitFor(
          changing,
          function changingIsDone(){
              this.log("[Assertor:changedTo][ThisIsWhatWeWant] Changing is a function return true!", "debug");
          },
          function changingIsNotComplete(){
              this.log("[Assertor:changedTo][WeDoNotWantThis] Changing is a function return false!", "error");
              this.waitingStatusChangedTimeoutFail("Please use 'this.echo' or 'this.log' to print message in changing function to find which part of changing is not happen.");
          },
          timeout);
    } else if(utils.isObject(changing)) {
        var reporter = this.newStatusesReporter(changing, "changedTo");
        return this.waitFor(
          this.newChangedToTester(changing),
          function changingIsDone() {
              reporter.apply(this);
          },
          function changingIsNotComplete() {
              reporter.apply(this);
              this.waitingStatusChangedTimeoutFail("Not all selectors' statuses are changed to expected one, please check logs above and fix it.");
          },
          timeout);
    } else {
        throw new CasperError('Unsupported changing type');
    }
};

/**
 * Verify elements' statuses unchanging, case go on if it remained; fail if not.
 *
 * We use fast-fail strategy here, once we catch something can not remain its status, we fail the case as soon as possible.
 * Because we definitely catch a bug here.
 *
 * @param unchanging, remainedTestFunction or remainedStatuses:
 * 1. If you want to use this, please read it carefully. Do not use it if you are not fully understand it. A complex
 *    unchanging verification may be very complicated that we can't express in remainedStatuses. So we need to use test
 *    function to verify it,test function return false if something can not remained unchanged, true if not.
 *    Use fast-fail strategy in your remainedTestFunction is a good practice.
 *
 * 2. Or collection of selectors and their status
 *  = {
 *   visible: selectors,
 *   invisible : selectors,
 *   checked : selectors,
 *   unchecked : selectors,
 *   ...
 * }
 * @param timeout
 * @returns Spooky
 */
Spooky.prototype.remained = function(unchanging, timeout){
    var that = this;
    if (utils.isFunction(unchanging)){
        return this.waitFor(
          function unremainedChecker(){
              return ! unchanging.apply(that);
          },
          function weCatchSomethingCannotRemainedUnchanged(){
              this.log("[Assertor:remained][WeDoNotWantThis] Unchanging is a function return true!", "error");
              this.unremainedCaughtFail("It seems we catch a bug! Please use 'this.echo' or 'this.log' to print message in unchanging function to locate the bug.");
          },
          function everythingIsUnchanged(){
              this.log("[Assertor:remained][ThisIsWhatWeWant] Unchanging is a function return false!", "debug");
          },
          timeout);
    } else if(utils.isObject(unchanging)) {

        var reporter = this.newStatusesReporter(unchanging, "remained");
        return this.waitFor(
          this.newUnremainedCatcher(unchanging),
          function weCatchSomeUnremainedStatusSelectors() {
              reporter.apply(this);
              this.unremainedCaughtFail("Not all selectors' statuses remained unchanged, , it seems we catch a bug! Please check logs above and fix it");
          },
          function allOfSelectorsRemainedStatus() {
              reporter.apply(this);
          },
          timeout);
    } else {
        throw new CasperError('Unsupported unchanging type');
    }
};

/**
 * Can be used to concatenate common or shared steps into a special case or steps
 *
 * @param stepsFunction, a function with 'this'=Spooky scripting test steps
 * @param [parameters]
 */
Spooky.prototype.concatSteps = function(stepsFunction){
    if(!utils.isFunction(stepsFunction)){
        throw new CasperError('Unsupported steps type');
    }
    var parameters = Array.prototype.slice.call(arguments, 1);
    stepsFunction.apply(this, parameters);
    return this;
};

exports.Spooky = Spooky;
