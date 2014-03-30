// 0xJQ Project 
// Copyright (c) 2014, Tomasz Zduńczyk <tomasz@zdunczyk.org>
// Released under the MIT license.

(function($) {
    
    var SelectorCollection,
        Selector,
        defaults = {
            compressRatio: 0.5,
            rootSelector: 'body',
           
            // internal modifiers, sum should be equal to 4.0
            cuttingRatioModifier: 2.5,
            nearbyRatioModifier: 0.5,
            partUniqueModifier: 0.5,
            fullUniqueModifier: 0.5
        };
        
    
    SelectorCollection = (function() {
        var node = {
            NULL: 1,
            PARENT: 2,
            ANCESTOR: 3
        };

        function getGlue(node_type) {
            switch(node_type) {
                case node.PARENT: {
                    return ' > ';                            
                }
                case node.ANCESTOR: {
                    return ' ';
                }
            }
        }

        function SelectorCollection() {
            this.selectors = []; 
        } 

        SelectorCollection.node = node;   

        SelectorCollection.prototype = {
            addSelector: function(node, selector) {
                this.selectors.push({ type: node, obj: selector });            
            },
            getBestSelector: function($parent, current_collection, cutting_ratio, nearby_ratio) {
                // normalize size
                var max_size = 0;
                for(var s in this.selectors)
                    this.selectors[s].obj.getSize() > max_size && (max_size = this.selectors[s].obj.getSize());    
                
                var min_rating,
                    min_selector,
                    min_unique_rating,
                    min_unique_selector,
                    selector_until = current_collection.getCssSelector(),
                    rating;
            
                for(var s in this.selectors) {
                    rating = this.selectors[s].obj.calcRating(
                        this.selectors[s].obj.getSize() / max_size,
                        getGlue(this.selectors[s].type) + selector_until,
                        cutting_ratio,
                        nearby_ratio
                    );
            
                    if(typeof min_rating === 'undefined' || rating < min_rating) {
                        min_rating = rating;
                        min_selector = this.selectors[s].obj;
                    }

                    if($parent.children(this.selectors[s].obj.getCssSelector()).length === 1 
                            && (
                                typeof min_unique_rating === 'undefined'
                                || rating < min_unique_rating
                            ) 
                    ) {
                        min_unique_rating = rating;
                        min_unique_selector = this.selectors[s].obj;
                    }
                }

                if(typeof min_unique_selector !== 'undefined')
                    return min_unique_selector;
                
                // :nth-child() starts at 1
                min_selector.setPosition($(min_selector.getCssSelector()).index() + 1);

                return min_selector;
            },
            last: function() {
                if(this.selectors.length > 0)
                    return this.selectors[this.selectors.length - 1].obj;        

                return null;
            },
            getCssSelector: function() {
                var result = '',
                    s;
                
                for(s = this.selectors.length - 1; s >= 0; s--) {
                    result += this.selectors[s].obj.getCssSelector() + getGlue(this.selectors[s].type);
                } 
                
                return result;
            },
            clear: function() {
                this.selectors = [];
            }
        };

        return SelectorCollection;
    })();


    Selector = (function() {

        var types = {
            ID: 1.0,
            CLASS: 0.8,
            ATTR_EQUALS: 0.6, 
            ATTR_HAS: 0.4,
            ELEMENT: 0.2
        };

        var root_instance, 
            root_length,
            settings; 

        function details(type, attr, value) {
             switch(type) {
                 case types.ID:
                     return { selector: '#' + value, size: value.length + 1 };
                 case types.CLASS:
                     return { selector: '.' + value, size: value.length + 1 };
                 case types.ATTR_EQUALS:
                     return { 
                        selector: '[' + attr + '^="' + value + '"]',
                        size: value.length + 5
                     };
                 case types.ATTR_HAS:
                     return { selector: '[' + value + ']', size: 1 };
                 default: /* types.ELEMENT */
                     return { selector: value.toLowerCase(), size: 1 };
             }
        }

        function getUnique(selector) {
            return 1.0 - $(root_instance).find(selector).length / root_length;
        }
        
        function Selector(type, attr, value) {
            this.type = type;
            this.attr = attr;
            this.value = value;
            this.details = details(type, attr, value);
            
            this.position = undefined;
            this.rating = undefined;
        }

        Selector.setSettingsProvider = function(provider) {
            settings = provider; 
            root_instance = $(provider.rootSelector);
            root_length = root_instance.find('*').length;
        };

        Selector.types = types;
        
        Selector.prototype = {
            types: types,
            getType: function() {
                return this.type;
            },
            getRating: function() {
                return this.rating;  
            },
            calcRating: function(normalized_size, until_selector, cutting_ratio, nearby_ratio) {
                var part_unique, 
                    full_unique,
                    quality = 0.0;
                    
                part_unique = full_unique = 1.0;
                
                if(this.type !== types.ID) {
                    part_unique = getUnique(this.details.selector);
                    full_unique = getUnique(this.details.selector + ' ' + until_selector);
                } 
                
                cutting_ratio *= settings.cuttingRatioModifier;
                nearby_ratio *= settings.nearbyRatioModifier;
                part_unique *= settings.partUniqueModifier;
                full_unique *= settings.fullUniqueModifier;
                
                quality = this.type * (cutting_ratio + nearby_ratio + part_unique + full_unique) / 4.0; // more = better
                
                return (this.rating = settings.compressRatio * normalized_size + (1.0 - settings.compressRatio) * (1.0 - quality));
            },
            getSize: function() {
                return this.details.size;
            },
            getCssSelector: function() {
                var suffix = '';
                
                if(typeof this.position !== 'undefined')
                    suffix = ':nth-child(' + this.position + ')';
                
                return this.details.selector + suffix;        
            },
            setPosition: function(position) {
                position >= 0 && (this.position = position);
            },
            requiresParent: function() {
                return typeof position !== 'undefined';
            },
            toString: function() {
                return this.attr + ', ' + this.value;
            }
        };

        return Selector;
    })();

    $.fn.xJQ = function(options) {
        
        var settings = $.extend({}, defaults, options); 
        
        Selector.setSettingsProvider(settings);
        
        var current = $(this),
            parent,
            cutting_ratio,
            nearby_ratio,
            root = $(settings.rootSelector),
            parents = $(this).parentsUntil(settings.rootSelector),
            pos = 0,
            element = new SelectorCollection,
            result = new SelectorCollection,
            last_added_pos,
            last_added,
            relation,
            current_tagname,
            best;
        
        do {
            last_added = result.last();
            parent = current.parent();

            relation = SelectorCollection.node.NULL;    
            
            if(Math.abs(last_added_pos - pos) === 1)
                relation = SelectorCollection.node.PARENT; 
            else
                relation = SelectorCollection.node.ANCESTOR;

            // current is empty only in $(this), where cutting_ratio should be high (1.0)
            cutting_ratio = 1.0 - (current.find('*').length / parent.find('*').length);
            nearby_ratio = 1.0 - (pos / parents.length) * 0.5;

            current_tagname = current.prop('tagName'); 
            
            element.addSelector(relation, new Selector(Selector.types.ELEMENT, 'tagName', current_tagname));
            
            $.each(current[0].attributes, function(index, attr) {
                if(attr.name === 'id') {
                    element.addSelector(relation, new Selector(Selector.types.ID, attr.name, attr.value));
                            
                } else if(attr.name === 'class') {
                    $.each(attr.value.split(/\s+/), function(index, clas) {
                        element.addSelector(relation, new Selector(Selector.types.CLASS, attr.name, clas));
                    });                
                } else {
                    element.addSelector(relation, new Selector(Selector.types.ATTR_EQUALS, attr.name, attr.value));
                }
                
                element.addSelector(relation, new Selector(Selector.types.ATTR_HAS, attr.name, attr.name));
            });
          
            best = element.getBestSelector(parent, result, cutting_ratio, nearby_ratio);
            
                // when $(this) element currently selected
            if(pos === 0 
                // or have better rating than the last one added
                || best.getRating() < last_added.getRating()
                // or can't unambiguously resolve current selector
                || parent.find(result.getCssSelector()).length > 1
                // was last added selector :nth-child()
                || last_added.requiresParent()
            ) {
                result.addSelector(relation, best);
                last_added_pos = pos;
            }
                
            element.clear();
            current = parent;
            pos++;
            
        } while(current[0] !== document && current[0] !== root[0]);
        
        return result.getCssSelector();
    };
    
})(jQuery);
