module.exports = function(grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        output: 'xJQ-<%= pkg.version %>', 
        concat: {
            options: {
                separator: ';',
                banner: '(function() { \n',
                footer: '\n })();'
            },
            dist: {
                src: ['lib/**/*.js'],
                dest: 'release/<%= output %>.js'
            }
        },
        uglify: {
            options: {
                banner: '\
\
// <%= pkg.name %> Project \n\
// Copyright (c) 2014, <%= pkg.author %> <tomasz@zdunczyk.org> \n\
// @see <%= pkg.repository.url %> \n\
// Released under the <%= pkg.license %> license. \n\
\
                \n'
            },
            dist: {
                files: {
                    'release/<%= output %>.min.js': ['<%= concat.dist.dest %>']
                }
            }
        }
    });
    
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    
    grunt.registerTask('default', ['concat', 'uglify']);
};


