require = patchRequire(require);
var tpl = require('tpl');
var utils = require('utils');
var spooky = new tpl.CustomizedSpooky();

var your_script = function(){
  this.open(url)
      .doClick(selector)
      .changedToVisible(selector)
      .changedToInvisible(selector)
      .....
}

spooky
  .start()
  
  .concatSteps(your_script)
  
  .run();
