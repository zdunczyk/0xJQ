// 0xJQ Project 
// Copyright (c) 2014, Tomasz Zduńczyk <tomasz@zdunczyk.org>
// Released under the MIT license.

var Dict = Dict || {},
    KEYWORD_DESCENDANT = 0,
    KEYWORD_CHILD = 1,
    KEYWORD_ID = 2,
    KEYWORD_NUM = 3,
    KEYWORD_STOP = 4,
    KEYWORD_HAS = 5,
    KEYWORD_EQUALS = 6,
    KEYWORD_CLASS = 7;

Dict.keywords = [
	/* KEYWORD_DESCENDANT */ '00',
	/* KEYWORD_CHILD */ '01',
	/* KEYWORD_ID */ '100',
	/* KEYWORD_NUM */ '101',
	/* KEYWORD_STOP */ '11000',
	/* KEYWORD_HAS */ '11001',
	/* KEYWORD_EQUALS */ '1101',
	/* KEYWORD_CLASS */ '111'
];