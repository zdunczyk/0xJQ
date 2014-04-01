// 0xJQ Project 
// Copyright (c) 2014, Tomasz Zduńczyk <tomasz@zdunczyk.org>
// Released under the MIT license.

var Dict = Dict || {},
    KEYWORD_DESCENDANT = 0,
    KEYWORD_CHILD = 1,
    KEYWORD_NUM = 2,
    KEYWORD_CLASS = 3,
    KEYWORD_ID = 4,
    KEYWORD_TAG = 5,
    KEYWORD_EQUALS = 6,
    KEYWORD_HAS = 7,
    KEYWORD_STOP = 8;

Dict.keywords = [
    /* KEYWORD_DESCENDANT */ '00',
    /* KEYWORD_CHILD */ '111',
    /* KEYWORD_NUM */ '110',
    /* KEYWORD_CLASS */ '100',
    /* KEYWORD_ID */ '011',
    /* KEYWORD_TAG */ '010',
    /* KEYWORD_EQUALS */ '1010',
    /* KEYWORD_HAS */ '10111',
    /* KEYWORD_STOP */ '10110'
];