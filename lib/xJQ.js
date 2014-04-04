// 0xJQ Project 
// Copyright (c) 2014, Tomasz Zduńczyk <tomasz@zdunczyk.org>
// Released under the MIT license.

(function($) {
    
    var SelectorCollection,
        Selector,
        ElementContent,
        defaults = {
            compressRatio: 0.5,
            rootSelector: 'body',
           
            // internal modifiers, sum should be equal to 4.0
            cuttingRatioModifier: 2.5,
            nearbyRatioModifier: 0.5,
            partUniqueModifier: 0.5,
            fullUniqueModifier: 0.5,

            contentShinglesNum: 8
            
        };

    function getBytesFromBits(bitstring) {
        var bytes = bitstring.match(/.{1,8}/g),
            last_shift = 8 - bytes[bytes.length - 1].length,
            result = [];

        result = bytes.map(function(byte) {
            return parseInt(byte, 2);
        });

        // pad to full byte
        result[result.length - 1] = result[result.length - 1] << last_shift;

        return result;
    }

    function alignTo(bits, size) {
        var zeros = size - bits.length,
            result = '';
        
        if(zeros > 0) {
            for(var i = 0; i < zeros; i++) 
                result += '0';     
        }

        return result + bits;
    }
    
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
                default:
                    return '';
            }
        }

        function getBitsetGlue(node_type) {
            switch(node_type) {
                case node.PARENT: {
                    return Dict.keywords[KEYWORD_CHILD];
                }
                case node.ANCESTOR: {
                    return Dict.keywords[KEYWORD_DESCENDANT];        
                }
                default:
                    return '';
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
            getBestSelector: function($elem, current_collection, cutting_ratio, nearby_ratio) {
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

                    if($elem.parent().children(this.selectors[s].obj.getCssSelector()).length === 1 
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
                min_selector.setPosition($elem.parent().children(min_selector.getCssSelector()).index($elem) + 1);

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
            getBinarySelector: function() {
                var selector = '',
                    vals = [],
                    current,
                    s;
                
                for(s = this.selectors.length - 1; s >= 0; s--) {
                    current = this.selectors[s];
                    selector += current.obj.getBitsetSelector() + getBitsetGlue(current.type);
                    vals = vals.concat(current.obj.getBinaryValue()); 
                }
                
                selector += Dict.keywords[KEYWORD_STOP];
                
                return getBytesFromBits(selector).concat(vals);
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

        function valueSize(value) {
            return (value.length + 1) * 8;
        }

        function getSelector(type, attr, value) {
            var selector = '';
            
            switch(type) {
                case types.ID:
                    selector = Dict.keywords[KEYWORD_ID];
                    return { 
                        text: '#' + value, 
                        binary: selector, 
                        size: selector.length + valueSize(value)
                    };
                    
                case types.CLASS:
                    selector = Dict.keywords[KEYWORD_CLASS];
                    return { 
                        text: '.' + value, 
                        binary: selector,
                        size: selector.length + valueSize(value)
                    };

                 case types.ATTR_EQUALS:
                     selector = Dict.keywords[KEYWORD_EQUALS] + Dict.attrs[attr];
                     return { 
                        text: '[' + attr + '^="' + value + '"]',
                        binary: selector,
                        size: selector.length + valueSize(value)
                     };

                 case types.ATTR_HAS:
                     selector = Dict.keywords[KEYWORD_HAS] + Dict.attrs[value];
                     return { 
                        text: '[' + value + ']', 
                        binary: selector,
                        size: selector.length
                     };

                 case types.ELEMENT:
                     selector = Dict.keywords[KEYWORD_TAG] + Dict.elements[value.toLowerCase()];
                     return { 
                        text: value.toLowerCase(),
                        binary: selector,
                        size: selector.length
                     };
             }
        }

        function getUnique(selector) {
            return 1.0 - $(root_instance).find(selector).length / root_length;
        }
        
        function Selector(type, attr, value) {
            this.type = type;
            this.attr = attr;
            this.value = value;
            this.selector = getSelector(type, attr, value);
            
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
                    part_unique = getUnique(this.selector.text);
                    full_unique = getUnique(this.selector.text + ' ' + until_selector);
                } 
                
                cutting_ratio *= settings.cuttingRatioModifier;
                nearby_ratio *= settings.nearbyRatioModifier;
                part_unique *= settings.partUniqueModifier;
                full_unique *= settings.fullUniqueModifier;
                
                quality = this.type * (cutting_ratio + nearby_ratio + part_unique + full_unique) / 4.0; // more = better
                
                return (this.rating = settings.compressRatio * normalized_size + (1.0 - settings.compressRatio) * (1.0 - quality));
            },
            getSize: function() {
                return this.selector.size;
            },
            getCssSelector: function() {
                var suffix = '';
                
                if(typeof this.position !== 'undefined')
                    suffix = ':nth-child(' + (this.position % 256) + ')';
                
                return this.selector.text + suffix;        
            },
            getBitsetSelector: function() {
                var suffix = '';

                if(typeof this.position !== 'undefined')
                    suffix = Dict.keywords[KEYWORD_NUM] + (this.position % 256).toString(2);
                
                return this.selector.binary + suffix;
            },
            getBinaryValue: function() {
                switch(this.type) {
                    case types.ID:
                    case types.CLASS:
                    case types.ATTR_EQUALS: {
                        
                        var chars = this.value.split(''),
                            result = chars.map(function(ch) {
                                return ch.charCodeAt(0);        
                            });
                            
                        result.unshift(chars.length % 256);
                        return result;
                    }
                    default: 
                        return [];
                }
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

    ElementContent = (function() {

        var settings,
            MAX_SHINGLE_FREQ = 64,
            MAX_DESCENDANT_FREQ = 64;

        function get5BitCode(char) {
            char = char.charCodeAt(0);
            
            if(97 /* a */ <= char && char <= /* v */ 118)
                return char - 87;

            if(48 /* 0 */ <= char && char <= /* 9 */ 57)
                return char - 48;

            return 0;
        }

        function getTopFreqs(freq, limit, max_value) {
            var freq_keys,
                result = []; 

            freq_keys = Object.keys(freq).sort(function(a, b) {
                return freq[b] - freq[a];
            });
            
            for(var i = 0, j = 0; j < limit && i < freq_keys.length; i++) {
                if(freq[freq_keys[i]] <= max_value) {
                    result.push({ value: freq_keys[i], freq: freq[freq_keys[i]] });
                    j++;
                }
            }
            
            return result;
        }

        function getShingleFreqs($element) {
            var txt = $element.text().toLowerCase().replace(/([^a-w0-9])+/g, ''),
                stats = [],
                shingle;
            
            for(var i = 0; i < txt.length - 1; i++) {
                shingle = txt[i] + '' + txt[i + 1];
                
                if(typeof stats[shingle] === 'undefined')
                    stats[shingle] = 0;

                stats[shingle]++;
            }
            
            return getTopFreqs(stats, settings.contentShinglesNum, MAX_SHINGLE_FREQ);
        }

        function getDescendantFreqs($element) {
            var stats = [],
                tagName = '';
            
            $element.find('*').each(function() {
                tagName = $(this).prop('tagName').toLowerCase(); 

                if(typeof Dict.elements[tagName] !== 'undefined') {
                    
                    if(typeof stats[tagName] === 'undefined')
                        stats[tagName] = 0;

                    stats[tagName]++;
                }
            });
            
            return getTopFreqs(stats, settings.contentShinglesNum, MAX_DESCENDANT_FREQ);
        }

        function encodeShingles(shingles) {
            var result = [];
            
            for(var i = 0; i < shingles.length; i++) {
                var first_char = get5BitCode(shingles[i].value.charAt(0)),
                    second_char = get5BitCode(shingles[i].value.charAt(1)),
                    freq = (shingles[i].freq - 1) % 64;
                
                result.push((first_char << 3) | (second_char >>> 2));
                result.push(((second_char << 6) & 0xFF) | freq);
            }         
            
            return result;
        }

        function encodeDescendants(desc) {
            var result = '',
                freq;

            for(var i = 0; i < desc.length; i++) {
                freq = ((desc[i].freq - 1) % 64).toString(2);
                result += Dict.elements[desc[i].value] + alignTo(freq, 6); 
            }
            
            result += Dict.keywords[KEYWORD_STOP];
            
            return getBytesFromBits(result);
        }

        function ElementContent($element) {
            this.element = $element;
        }

        ElementContent.setSettingsProvider = function(provider) {
            settings = provider;
        };

        ElementContent.prototype = {
            getShingleFreqs: function() {
                return getShingleFreqs(this.element);    
            },
            getDescendantFreqs: function() {
                return getDescendantFreqs(this.element);
            },
            getOptimalFreqsEncoded: function() {
                var shingles = getShingleFreqs(this.element),
                    descendants = getDescendantFreqs(this.element),
                    shingles_total = 0,
                    descendants_total = 0,
                    result = 0,
                    control_byte,
                    i;
                
                for(i = 0; i < shingles.length; i++)
                    shingles_total += shingles[i].freq;    
                
                for(i = 0; i < descendants.length; i++)
                    descendants_total += descendants[i].freq;   

                if(shingles_total > descendants_total) {
                    result = encodeShingles(shingles);
                    control_byte = (result.length % 128) | 0x80;
                } else {
                    result = encodeDescendants(descendants);
                    control_byte = (result.length % 128);
                }
                
                result.unshift(control_byte);
                return result;
            }
        };

        return ElementContent;
    })();

    $.fn.xJQ = function(options) {
        
        var settings = $.extend({}, defaults, options); 
        
        Selector.setSettingsProvider(settings);
        ElementContent.setSettingsProvider(settings);
        
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
            else if(pos !== 0)
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
          
            best = element.getBestSelector(current, result, cutting_ratio, nearby_ratio);
            
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
     
        var content = new ElementContent($(this));
        
        return result.getBinarySelector().concat(content.getOptimalFreqsEncoded());
    };
    
})(jQuery);
