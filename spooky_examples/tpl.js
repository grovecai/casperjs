require = patchRequire(require);
var Spooky = require('spooky').Spooky;
var utils = require('utils');
var fs = require('fs');
var SECOND = 1000;
var ONE_MINUTE = 60 * SECOND;
var TWENTY_SECONDS = 20 * SECOND;
var THIRTY_SECONDS = 30 * SECOND;
var USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36';
var VIEWPORT_WIDTH = 1280;
var VIEWPORT_HEIGHT = 800;

var casperOptions = {
    logLevel : "debug",
    verbose : true,
    viewportSize : {
        width : VIEWPORT_WIDTH,
        height : VIEWPORT_HEIGHT
    },
    pageSettings : {
        javascriptEnabled : true,
        loadImages : false,
        loadPlugins : false,
        userAgent : USER_AGENT
    },

    waitTimeout : ONE_MINUTE * 0.7,

    onWaitTimeout: function _onWaitTimeout(timeout) {
        this.waitingStatusChangedTimeoutFail("Wait timeout of {0}ms expired, exiting.".format(timeout));
    }

};

var spookyOptions = {
     generatePathToSaveFailureScene : function(){
         return this.pathToSaveFailureScene;
     }
};

function CustomizedSpooky() {
    CustomizedSpooky.super_.apply(this, [casperOptions, spookyOptions]);

    //enable cookie
    phantom.cookiesEnabled = true;

    //init parameters from command-line
    _.extend(this, this.cli.options);
}

utils.inherits(CustomizedSpooky, Spooky);

exports.CustomizedSpooky = CustomizedSpooky;

exports.hookEvents = function(){
    //hook event to log failed loading resource
    this.on('load.failed',function logLoadingResourceFailure(response){
        this.echo("++++++++++++++++++load.failed: \n status - {0}\n http_status - {1}\n url - {2}".format(response.status, response.http_status, response.url));
    });

    this.on("page.error", function(msg, trace) {
        this.echo("Error: " + msg, "ERROR");
    });

    this.on("resource.error", function(err) {
        this.echo("resource.error: ");
        utils.dump(err);
    });

    this.on('remote.message', function(msg) {
        this.echo('remote message caught: ' + msg);
    });

    this.log("Running test script: " + this.testScript, 'info');
};


