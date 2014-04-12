// 0xJQ Project 
// Copyright (c) 2014, Tomasz Zduńczyk <tomasz@zdunczyk.org>
// Released under the MIT license.

(function($) {
    
    var SelectorCollection,
        Selector,
        ElementContent,
        SearchTree,
        encoder_defaults = {
            compressRatio: 0.5,
            rootSelector: 'body',
           
            // internal modifiers, sum should be equal to 4.0
            cuttingRatioModifier: 2.5,
            nearbyRatioModifier: 0.5,
            partUniqueModifier: 0.5,
            fullUniqueModifier: 0.5,

            contentShinglesNum: 8
        },
        decoder_defaults = {
            rootSelector: 'body',
            
            // when decoder is unable to get encoded element directly by
            // selector it goes up the DOM tree `generalLevels` times (from element 
            // referenced by selector), than calculates the similarity of all 
            // encountered elements and chooses best one globally, the next step 
            // is to traverse deeper into the choosen element, up to `approxLevels`
            // times, only if similarity of succeeding children is increasing
            generalLevels: 1, // generalizing phase, goes up 
            approxLevels: 3, // approximating phase, goes down

            // when encoded selector doesn't match any element, it could be trimmed
            // from right `trimSelectorParts` times to get some more general selectors
            // probably containing the wanted one
            trimSelectorParts: 1,

            // when calculated similarity is lower than threshold two elements 
            // are treated as identical
            similarityThreshold: 1.0
        };

    function getBytesFromBits(bitstring) {
        if(bitstring === '')
            return [];

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
                    selector_until = current_collection.getReversedCssSelector(),
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
            getReversedCssSelector: function() {
                var result = '',
                    s;
                
                for(s = this.selectors.length - 1; s >= 0; s--) {
                    result += this.selectors[s].obj.getCssSelector() + getGlue(this.selectors[s].type);
                } 
                
                return result;
            },
            getCssSelector: function() {
                var result = '',
                    s;
                
                for(s = 0; s < this.selectors.length; s++) {
                    result += getGlue(this.selectors[s].type) + this.selectors[s].obj.getCssSelector();
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
            },
            each: function(callback) {
                for(s = 0; s < this.selectors.length; s++) {
                    var result = callback(this.selectors[s].obj, this.selectors[s].type);
                    
                    if(typeof result !== 'undefined' && typeof result.type !== 'undefined')
                        this.selectors[s].type = result.type;
                } 
            },
            splice: function(i, size) {
                return this.selectors.splice(i, size);
            },
            size: function() {
                return this.selectors.length;        
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
            if(typeof value === 'undefined')
                return 0;
            
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

            if(typeof this.value !== 'undefined')
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
                    suffix = Dict.keywords[KEYWORD_NUM] + alignTo((this.position % 256).toString(2), 8);
                
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
                if(position >= 0 || (typeof position === 'undefined'))
                    this.position = position;
            },
            setValue: function(value) {
                this.value = value; 
                this.selector = getSelector(this.type, this.attr, value);
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
            MAX_SHINGLE_FREQ_POW = 6,
            MAX_DESCENDANT_FREQ_POW = 6,
            MAX_SHINGLE_FREQ = Math.pow(2, MAX_SHINGLE_FREQ_POW),
            MAX_DESCENDANT_FREQ = Math.pow(2, MAX_DESCENDANT_FREQ_POW),
            types = {
                TEXT: 0,
                TAGS: 1
            };

        function get5BitCode(char) {
            char = char.charCodeAt(0);
            
            if(97 /* a */ <= char && char <= /* v */ 118)
                return char - 87;

            if(48 /* 0 */ <= char && char <= /* 9 */ 57)
                return char - 48;

            return 0;
        }

        function get5BitChar(code) {
            if(0 <= code && code <= 9) 
                code += 48;

            if(10 <= code && code <= 31)
                code += 87;
            
            return String.fromCharCode(code);
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

        function getAllShingleFreqs($element) {
            var txt = $element.text().toLowerCase().replace(/([^a-v0-9])+/g, ''),
                stats = [],
                shingle;
            
            for(var i = 0; i < txt.length - 1; i++) {
                shingle = txt[i] + '' + txt[i + 1];
                
                if(typeof stats[shingle] === 'undefined')
                    stats[shingle] = 0;

                stats[shingle]++;
            }
            
            return stats;
        }

        function getAllDescendantFreqs($element) {
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
            
            return stats;
        }

        function encodeShingles(shingles) {
            var result = [];
            
            for(var i = 0; i < shingles.length; i++) {
                var first_char = get5BitCode(shingles[i].value.charAt(0)),
                    second_char = get5BitCode(shingles[i].value.charAt(1)),
                    freq = (shingles[i].freq - 1) % MAX_SHINGLE_FREQ;
                
                result.push((first_char << 3) | (second_char >>> 2));
                result.push(((second_char << 6) & 0xFF) | freq);
            }         
            
            return result;
        }

        function decodeShingles(bytearr) {
            var shingles = {};
            
            for(var i = 0; i < bytearr.length; i += 2) {
                var first_char = get5BitChar(bytearr[i] >>> 3),
                    second_char = get5BitChar((bytearr[i] & 0x07) << 2 | (bytearr[i + 1] & 0xC0) >>> 6),
                    freq = bytearr[i + 1] & 0x3F;
               
                shingles[first_char + '' + second_char] = freq + 1;
            }    

            return shingles;
        }

        function encodeDescendants(desc) {
            var result = '',
                freq;
            
            for(var i = 0; i < desc.length; i++) {
                freq = ((desc[i].freq - 1) % MAX_DESCENDANT_FREQ).toString(2);
                result += Dict.elements[desc[i].value] + alignTo(freq, 6); 
            }
            
            return getBytesFromBits(result);
        }

        function decodeDescendants(bytearr, desc_len, st_elements) {
            var i = 0,
                bit = null,
                element = true,
                element_pos = st_elements,
                last_element = null,
                freq = 0x00,
                freq_cnter = 0,
                result = {},
                stopped = false;
            
            for(; i < bytearr.length && !stopped; i++) {
                for(var b = 0x80; b > 0x00; b = b >>> 1) {
                    bit = +((bytearr[i] & b) === b);

                    if(element) {
                        element_pos = element_pos[bit]; 
                        
                        if({}.toString.call(element_pos) !== '[object Array]') {
                            last_element = element_pos;
                            element_pos = st_elements;
                            element = false;
                        }
                    } else {
                        freq |= bit << (MAX_DESCENDANT_FREQ_POW - (++freq_cnter));

                        if(freq_cnter === MAX_DESCENDANT_FREQ_POW) {
                            result[last_element] = freq + 1; 
                            
                            freq = 0x00;
                            element = true;
                            freq_cnter = 0;
                            
                            if(result.length === desc_len) {
                                stopped = true;
                                break;
                            }
                        }
                    }
                }
            }

            return result;
        }

        function ElementContent($element) {
            this.element = $element;
        }

        ElementContent.types = types;

        ElementContent.setSettingsProvider = function(provider) {
            settings = provider;
        };

        ElementContent.fromEncodedFreqs = function(bytearr, st_elements) {
            var content_len = (bytearr[0] & 0x7F),
                content = bytearr.slice(1, content_len + 1);
                result = new ElementContent;
            
            result.shingles = [];
            result.descs = [];
            
            if((bytearr[0] & 0x80) === 0x80) {
                result.shingles = decodeShingles(content);
                result.type = types.TEXT; 
            } else {
                result.descs = decodeDescendants(content, content_len, st_elements);
                result.type = types.TAGS;
            }       

            return result;
        };

        ElementContent.prototype = {
            getType: function() {
                return this.type;        
            },
            // returns [val] = freq
            getAllShingleFreqs: function() {
                if(typeof this.shingles === 'undefined')
                    this.shingles = getAllShingleFreqs(this.element);
                
                return this.shingles;    
            },
            // returns [val] = freq
            getAllDescendantFreqs: function() {
                if(typeof this.descs === 'undefined')
                    this.descs = getAllDescendantFreqs(this.element);

                return this.descs;
            },
            // returns { value: val, freq: freq }
            getShingleFreqs: function() {
                return getTopFreqs(this.getAllShingleFreqs(), 
                                   settings.contentShinglesNum, 
                                   MAX_SHINGLE_FREQ);
            },
            // returns { value: val, freq: freq }
            getDescendantFreqs: function() {
                return getTopFreqs(this.getAllDescendantFreqs(), 
                                   settings.contentShinglesNum, 
                                   MAX_DESCENDANT_FREQ);
            },
            getAllFreqs: function() {
                if(this.getType() === types.TEXT)
                    return this.getAllShingleFreqs();
                if(this.getType() === types.TAGS)
                    return this.getAllDescendantFreqs();
            }, 
            getOptimalFreqsEncoded: function() {
                var shingles = this.getShingleFreqs(),
                    descendants = this.getDescendantFreqs(),
                    shingles_total = 0,
                    descendants_total = 0,
                    result = [],
                    control_byte = 0x00,
                    i;
                
                for(i = 0; i < shingles.length; i++)
                    shingles_total += shingles[i].freq;    
                
                for(i = 0; i < descendants.length; i++)
                    descendants_total += descendants[i].freq;   

                if(shingles_total > descendants_total) {
                    result = encodeShingles(shingles);
                    control_byte = (result.length % 128) | 0x80;
                    
                    this.type = types.TEXT;
                } else {
                    result = encodeDescendants(descendants);
                    control_byte = (result.length % 128);

                    this.type = types.TAGS;
                }
                
                result.unshift(control_byte);
                return result;
            },
            distance: function(content) {
                var dest_freqs = [],
                    src_freqs = this.getAllFreqs(),
                    result = 0,
                    freq = 0;

                if(this.getType() === types.TEXT)
                    dest_freqs = content.getAllShingleFreqs();
                else if(this.getType() === types.TAGS)
                    dest_freqs = content.getAllDescendantFreqs();
                
                for(var val in src_freqs) {
                    freq = 0;
                    if(typeof dest_freqs[val] !== 'undefined')
                        freq = dest_freqs[val];
                    
                    result += Math.pow(src_freqs[val] - freq, 2);
                }
                    
                return Math.sqrt(result);
            },
            // gets minimal distance from elements specified in collection
            minDistance: function(collection, callback) {
                var min_elem_dist,
                    distance,
                    that = this;
                
                $(collection).each(function() {
                    distance = that.distance(new ElementContent($(this)));
                    
                    if({}.toString.call(callback) === '[object Function]')
                        callback($(this), distance);
                    
                    if(typeof min_elem_dist === 'undefined' || (distance < min_elem_dist.dist))
                        min_elem_dist = { dist: distance, elem: $(this) };  
                });

                return min_elem_dist;
            }
        };

        return ElementContent;
    })();

    SearchTree = {
        getArray: function(huffman_codes) {
            var tree = [],
                bit_code = [],
                tree_pos,
                bit,
                sorted_keys = Object.keys(huffman_codes).sort(function(a, b) {
                    return huffman_codes[a].length - huffman_codes[b].length;
                });
            
            for(var c = 0; c < sorted_keys.length; c++) {
                bit_code = huffman_codes[sorted_keys[c]];
                
                tree_pos = tree;
                for(var s = 0; s < bit_code.length - 1; s++) {
                    bit = parseInt(bit_code.charAt(s));
                    
                    if(typeof tree_pos[bit] === 'undefined')
                        tree_pos[bit] = [];
                    
                    tree_pos = tree_pos[bit];
                }
                tree_pos[parseInt(bit_code.charAt(bit_code.length - 1))] = sorted_keys[c];
            } 

            return tree;
        }
    };

    $.fn.xJQ = function(options) {
        
        var settings = $.extend({}, encoder_defaults, options); 
        
        Selector.setSettingsProvider(settings);
        ElementContent.setSettingsProvider(settings);
        
        var current = $(this).first(),
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

        if(current.length === 0) {
            throw new Error('xJQ: Cannot find selector of empty collection');
        }
        
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
                || parent.find(result.getReversedCssSelector()).length > 1
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
  
    $.xJQ = function(selector, options) {

        var settings = $.extend({}, decoder_defaults, options); 
        ElementContent.setSettingsProvider(settings);

        var st_elements = SearchTree.getArray(Dict.elements),
            st_attrs = SearchTree.getArray(Dict.attrs),
            st_keywords = SearchTree.getArray(Dict.keywords); 
        
        var MODE_KEYWORD = 0,
            MODE_GET_ELEMENT = 1,
            MODE_GET_ATTR = 2;

        var found = null,
            last_relation = SelectorCollection.node.NULL,
            last_keyword = null,
            st_pos = st_keywords,
            mode = MODE_KEYWORD,
            result_selector = new SelectorCollection,
            stopped = false,
            buffer = 0,
            bits_to_buffer = 0,
            bit_read = 0,
            byte_idx = 0;
        
        for(; byte_idx < selector.length && !stopped; byte_idx++) {
            for(var b = 0x80; b > 0x00 && !stopped; b = b >>> 1) {
                bit_read = +((selector[byte_idx] & b) === b);

                if(bits_to_buffer > 0) {
                    buffer |= bit_read << (--bits_to_buffer);
                    
                    if(bits_to_buffer === 0 && last_keyword === KEYWORD_NUM) {
                        result_selector.last().setPosition(buffer); 
                        bits_to_buffer = 0;
                        st_pos = st_keywords; 
                    }
                } else {
                    found = st_pos[bit_read];

                    if({}.toString.call(found) !== '[object Array]') {
                        switch(mode) {
                            case MODE_KEYWORD: {
                                last_keyword = +found;
                                
                                switch(+found) {
                                    case KEYWORD_NUM: {
                                        bits_to_buffer = 8;
                                        buffer = 0x00;
                                        break;
                                    }
                                    case KEYWORD_ID: {
                                        result_selector.addSelector(last_relation, new Selector(Selector.types.ID, 'id', found));
                                        st_pos = st_keywords; 
                                        break;
                                    }
                                    case KEYWORD_CLASS: {
                                        result_selector.addSelector(last_relation, new Selector(Selector.types.CLASS, 'class', found));
                                        st_pos = st_keywords; 
                                        break;
                                    }
                                    case KEYWORD_TAG: {
                                        mode = MODE_GET_ELEMENT; 
                                        st_pos = st_elements;
                                        break;        
                                    }
                                    case KEYWORD_HAS:
                                    case KEYWORD_EQUALS: {
                                        mode = MODE_GET_ATTR; 
                                        st_pos = st_attrs;
                                        break;
                                    }
                                    case KEYWORD_STOP: {
                                        stopped = true;
                                        break;
                                    }
                                    case KEYWORD_DESCENDANT: {
                                        last_relation = SelectorCollection.node.ANCESTOR;
                                        st_pos = st_keywords; 
                                        break;
                                    }
                                    case KEYWORD_CHILD: {
                                        last_relation = SelectorCollection.node.PARENT;
                                        st_pos = st_keywords; 
                                        break;
                                    }
                                    default: {
                                        st_pos = st_keywords; 
                                    }
                                }

                                break;
                            }
                            case MODE_GET_ELEMENT: {
                                if(last_keyword === KEYWORD_TAG) {
                                    result_selector.addSelector(last_relation, new Selector(Selector.types.ELEMENT, 'tagName', found));
                                }
                                
                                mode = MODE_KEYWORD;
                                st_pos = st_keywords;
                                break;
                            }
                            case MODE_GET_ATTR: {
                                switch(last_keyword) {
                                    case KEYWORD_HAS: {
                                        result_selector.addSelector(last_relation, new Selector(Selector.types.ATTR_HAS, 'attr', found));
                                        break;
                                    }
                                    case KEYWORD_EQUALS: {
                                        result_selector.addSelector(last_relation, new Selector(Selector.types.ATTR_EQUALS, found));
                                        break;
                                    }
                                }
                                
                                mode = MODE_KEYWORD;
                                st_pos = st_keywords;
                                break;
                            }
                        }
                    } else {
                        st_pos = found;
                    }
                }
            }
        }
        
        result_selector.each(function(selector_part) {
            var str_len,
                str;
                
            switch(selector_part.getType()) {
                case Selector.types.ID: 
                case Selector.types.CLASS: 
                case Selector.types.ATTR_EQUALS: {
                    
                    str_len = selector[byte_idx++];
                    str = selector.slice(byte_idx, byte_idx + str_len);
                    selector_part.setValue(String.fromCharCode.apply(null, str));
                    
                    byte_idx += str_len;
                }
            }
            
        });
       
        var result_css_selector = result_selector.getCssSelector(),
            selected = $(result_css_selector),
            distance,
            min_elem_dist,
            child_elem_dist,
            content = ElementContent.fromEncodedFreqs(selector.slice(byte_idx), st_elements),
            prospectives = [],
            lvl_cnter,
            min_children;

        function saveProspectives(css_selector) {
            var elem = $(css_selector); 

            if(elem.length > 0) {
                return content.minDistance(elem, function(elem, dist) {
                    prospectives.push({ dist: dist, elem: elem });
                });
            }
        }
        
        if(selected.length > 1) {
            min_elem_dist = content.minDistance(selected, function(elem, distance) {
                prospectives.push({ dist: distance, elem: elem });
            });   
        
            // found element in collection ( e.g. meanwhile added one with same class )
            if(min_elem_dist.dist === 0)
                return min_elem_dist.elem;

        } else if(selected.length === 1) {
            distance = content.distance(new ElementContent(selected));
            min_elem_dist = { dist: distance, elem: selected };
            prospectives.push(min_elem_dist);
            
            // matching exactly, DOM hasn't changed
            if(distance === 0)
                return selected;
            
        } else {
            // 1. replace all '>' child selectors with ' ' descendant ones &
            //    get rid off all :nth-child()'s
            result_selector.each(function(elem, type) {
                elem.setPosition(undefined);                
                
                if(type === SelectorCollection.node.PARENT)
                    return { type: SelectorCollection.node.ANCESTOR };
            });
            
            saveProspectives(result_selector.getCssSelector());
            
            // 2. cut children from right to left '.parent #child' => '.parent'
            for(var idx, max, idx = max = result_selector.size() - 1; 
                    idx > 0, (max - idx) < settings.trimSelectorParts; 
                    idx--) {
                // remove current element
                result_selector.splice(idx, 1);

                saveProspectives(result_selector.getCssSelector()); 
            }
        }

        var generalized = [];
        
        /* @todo use previous calculations as part of next loop iteration */
        for(var p = 0; p < prospectives.length; p++) {
            lvl_cnter = 0;
            
            for(var prosp = prospectives[p].elem; 
                lvl_cnter < settings.generalLevels && prosp[0] !== document;
                lvl_cnter++, prosp = prosp.parent()) {
                    
                    generalized.push(prosp);
                    generalized.push.apply(generalized, prosp.siblings());
                }
        }
        
        if(generalized.length > 0) {
            min_elem_dist = content.minDistance(generalized);   
            
            lvl_cnter = 0;
            while((min_children = min_elem_dist.elem.children()) 
                    && min_children.length > 0
                    && settings.approxLevels > (lvl_cnter++)) {
        
                child_elem_dist = content.minDistance(min_children);
                
                if(child_elem_dist.dist < min_elem_dist.dist) {
                    min_elem_dist = child_elem_dist;
                } else
                    break;
            }
        }
        
        if(min_elem_dist.dist > settings.similarityThreshold)
            throw new Error('xJQ: element with selector `' + result_css_selector + '` cannot be found or its content has changed');
        
        return min_elem_dist.elem;
    };
})(jQuery);
