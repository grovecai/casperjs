/**
 * This is a selector utils used in Spook.js for selector type verification.
 */
var require = patchRequire(require);
var utils = require('utils');

var isXPathSelector = function(selector){
    return utils.isObject(selector) && selector.type && selector.type === "xpath";
};

exports.isXPathSelector = isXPathSelector;

var isSingleSelector = function(selector){
    return utils.isString(selector) || isXPathSelector(selector);
};

exports.isSingleSelector = isSingleSelector;

var isSelectorList = function(selectors){
    //TODO: need more verification
    return utils.isArray(selectors);
};

exports.isSelectorList = isSelectorList;

var isSelectorMap = function(selectors){
    //TODO: need more verification
    return utils.isObject(selectors) && (!selectors.type || selectors.type !== "xpath");
};

exports.isSelectorMap = isSelectorMap;

var isLazySelectors = function(selectors){
    return utils.isFunction(selectors);
};

exports.isLazySelectors = isLazySelectors;

exports.isSupportedSelectors = function(selectors){
    return isSingleSelector(selectors)
      || isSelectorList(selectors)
      || isSelectorMap(selectors)
      || isLazySelectors(selectors);
};

/**
 *
 * A helper to escape quotation in XPATH expression
 *
 * example:
 *         I'm "god"
 *             -->
 *             concat(\'I\', \"\'\", \'m \', \'\"\', \'god\', \'\"\')
 */
var xEscape = function(str)  {
    try {
        var parts = str.match(/[^'"]+|['"]/g);
        parts = parts.map(function (part) {
            if (part === "'") {
                return '\"\'\"';
            }

            if (part === '"') {
                return "\'\"\'";
            }
            return "\'" + part + "\'";
        });
        //"concat" method in XPath Evaluator accept at least two parameters, so add a empty string as first parameter
        return "concat(\'\'," + parts.join(", ") + ")";
    }catch(e){
        throw new Error("Can not escape this string - {0}".format(str));
    }

};

exports.xEscape = xEscape;

/**
 * Construct XPath selector with parent and childXPath
 *
 * @param xParent, XPath selector of parent element
 * @param childXPath, xpath of the child element under parent's scope, is a string or a XPath selector
 * @returns {*}
 */
var xChild = function (xParent, childXPath) {
    if(_.isString(childXPath)){
        return x(xParent.path + childXPath);
    } else if(isXPathSelector(childXPath)){
        return x(xParent.path + childXPath.path);
    } else{
        throw new Error("childXPath - {0} is neither a xpath expression nor a xpath selector.".format(childXPath.toString()));
    }

};

exports.xChild = xChild;

/**
 * Wrapper of selector, make it easy to verify element
 *
 * TODO: upgrade queries of spooky to support wrapper directly
 * @param selector, XPath selector
 * @returns wrapper = {
 *   type: string,
 *   X: the selector,
 *   append: Function,
 *   containedTexts: Function,
 *   withText: Function,
 *   withTextTrimmed: Function,
 *   blankText,
 *   subX: Function
 * }
 */
var wrapX = function(selector){
    return {
        type: "XWrapper",

        /**
         * xpath selector of wrapper
         */
        X: selector,

        /**
         * Append subXPath to produce sub wrapper
         *
         * @param subXPath
         * @returns {sub wrapper}
         */
        append: function(subXPath){
            return wrapX( selector.append(subXPath));
        },

        /**
         * containedTexts('a') === containedTexts(['a']) => selector contains text 'a'
         * containedTexts('a','b') === containedTexts(['a','b']) => selector contains text 'a' and 'b'
         * containedTexts('a','b', ...) === containedTexts(['a','b', ...])
         */
        containedTexts: function(){
            var texts = _.flatten(Array.prototype.slice.apply(arguments));
            return selector.append(_(texts).map(function(text){
                    return "[contains(.,{0})]".format(xEscape(text));
                }).join("") );
        },

        /**
         * withText('a') => selector that text === 'a'
         * @param text
         */
        withText: function(text){
            return selector.append("[text()={0}]".format(xEscape(text)));
        },

        /**
         * withTextTrimmed(' a b ') => selector that text === 'a b'
         * @param text
         */
        withTextTrimmed: function(text){
            return selector.append("[text()[normalize-space()={0}]]".format(xEscape(text)));
        },

        /**
         * selector that text === 'a'
         */
        blankText: selector.append("[not(text()) or text()[normalize-space()='']]"),

        /**
         * append subXPath to produce sub selector
         *
         * @param subXPath
         * @returns {sub selector}
         */
        subX: function(subXPath){
            return selector.append(subXPath);
        }
    };
};

exports.wrapX = wrapX;

/**
 * Evaluate xFragment if it's lazy
 *
 * @param xFragment
 *   lazy xFragment = function(options[, localIndex]){ return evaluatedXFragment; }
 *   'localIndex' is will be supplied in wrapper which cardinality is 'many'.
 * @param args = [options[, localIndex]]
 * @returns evaluated xFragment: String
 */
var evaluateXFragment = function(xFragment, args){
    var xf = xFragment;
    if(_.isFunction(xf))
        xf = xf.apply(null, args);

    if(!_.isString(xf)){
        throw new Error("Invalid xFragment - {0} that doesn't evaluate to a xpath expression fragment, which type should be string".format(xFragment.toString()));
    }

    return xf;
};

/**
 * Evaluate cardinality with ancestorOptions if it's lazy
 *
 * @param cardinality
 *   lazy cardinality = function(ancestorOptions){ return many/one/zero; }
 * @param ancestorOptions
 * @returns many/one/zero: String
 */
var evaluateCardinality = function(cardinality, ancestorOptions){
    var cd = cardinality;
    if(_.isFunction(cd))
        cd = cd.call(null, ancestorOptions);
    return cd;
};

/**
 * A recursive method that used to create mappings of children wrappers (children's name to wrappers)
 *
 * @param childrenElementsMappings = {elementName: element, ....}, it's 'elements' attribute of Element.
 * @param parentWrapper
 * @param parentOptions
 * @returns childrenXWrappersMappings = {elementName: wrapperOfElement, ...}
 */
var createChildrenXWrappersMappings = function recur(childrenElementsMappings, parentWrapper, parentOptions){

    var createChildXWrapper = function(childElement, argsOfXFragmentOfChildElement, options){
        var evaluatedXFragment = evaluateXFragment(childElement.xFragment, argsOfXFragmentOfChildElement);
        var childWrapper = parentWrapper.append( evaluatedXFragment );
        var xWrappersMappingsGrandChildren = recur(childElement.elements, childWrapper, options);
        return _.extend(childWrapper, xWrappersMappingsGrandChildren);
    };

    return _.collectMappings(childrenElementsMappings, function(childElement, childElementName){
        var makeChildXWrapper = createChildXWrapper.curry(childElement);
        var cardinality = evaluateCardinality(childElement.cardinality, parentOptions);
        //require("utils").dump("cardinality of {0} is evaluated to {1}".format(childElementName, cardinality));
        switch(cardinality){
            case "zero": return _.mapping( childElementName,
                                           "This is a not existed X wrapper. Please check the cardinality of the element - '{0}', which evaluated to zero"
                                               .format(childElementName));
            case "one":  return _.mapping( childElementName,
                                           makeChildXWrapper([parentOptions], parentOptions));
            case "many": return _.mapping( childElementName,
                                           function(localScopedId, options){
                                               var inheritedOptions = _.extend({},parentOptions, options);
                                               return makeChildXWrapper([inheritedOptions, localScopedId], inheritedOptions);
                                           });
            default:
                utils.dump(childElement);
                throw new Error("Unrecognized element's cardinality - {0} for above element - '{1}'. It's evaluated to '{2}', but not zero/one/many."
                                    .format(childElement.cardinality.toString(), childElementName, cardinality));
        }
    });
};

/**
 * A util that used to create tree of wrapper of xpath selector based on tree structure of rootElement(@param).
 *
 * TODO: A example to illustrate what tree of wrapper look like for specified tree of element
 *
 * @param rootElement, a recursive defined data structure that use to present logic perspective of UI components.
 * Element = {
 *   cardinality: zero, one or many, // optional for root element (MUST BE one), require for non-root elements
 *   xFragment: xpath fragment,      // xpath expression fragment that used to locate element under the scope of parent element
 *   elements:{                      // optional, children elements
 *     elementName : element,
 *     ...
 *   }
 * }
 * Both cardinality and xFragment can be lazy to gain flexibility.
 * 'options' supplied to LAZYs is inherit from all ancestors of element combine with it's own if possible.
 *   1. lazy cardinality = function(options){ return 'evaluated cardinality'}
 *   2. if cardinality is evaluated to one, lazy xFragment = function(options){ return 'evaluated cardinality'}
 *   3. if cardinality is evaluated to many, lazy xFragment = function(options, localScopedId){ return 'evaluated cardinality'}
 *
 * @param options, can be used to evaluate element's/descendant element's xFragment and cardinality
 */
var createXWrapperTree = function(rootElement, options){
    var rootWrapper = wrapX( x(rootElement.xFragment) );
    var childrenElementsMappings = rootElement.elements;
    var childrenXWrappersMappings = createChildrenXWrappersMappings(childrenElementsMappings, rootWrapper, options);
    return _.extend(rootWrapper, childrenXWrappersMappings);
};

exports.createXWrapperTree = createXWrapperTree;

/**
 * Helper that injects useful method for Element.
 *
 * @param attrs, of Element
 */
var createXElement = function(attrs){

    var _element = _.extend({elements: {}}, attrs);

    /**
     *
     * @param name
     * @param attrsOfChild
     * @private
     */
    var _addChildXElement = function(name, attrsOfChild){
        if(attrsOfChild && attrsOfChild.cardinality != "zero")
            _element.elements[name] = createXElement(attrsOfChild);
        return _element;
    };
    /**
     *
     * @param elementsMap
     * @private
     */
    var _addChildrenXElements = function(elementsMap){
        _.each(elementsMap, function(attrsOfChild, name){
            _addChildXElement(name, attrsOfChild);
        });
        return _element;
    };

    return _.extend(_element, {
        addChildXElement: _addChildXElement,
        addChildrenXElements: _addChildrenXElements
    });
};

exports.createXElement = createXElement;

/**
 * TODO:Dump X wrapper call links help drafting selector document
 *
 * @param rootXWrapper
 */
var dumpXWrapperCallLinks = function(rootXWrapper){

};
