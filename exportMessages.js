/**
 * Created by breinhart on 4/13/16.
 * Updated by tusindfryd on 17/12/20.
 *
 * Description:
 *  To export all iMessage conversations and images for a given account to an HTML document
 *  for easy searching, viewing, sharing, and storing.
 */

'use strict';

var sqlite3 = require('sqlite3').verbose();
var program = require('commander');
var readline = require('readline');
var fs = require('fs');
var Handlebars = require('handlebars');
var async = require('async');

// Local variable declarations
var dbPath;
var db;
var stmt;
var timerId;
var scope = {};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

//////////////////////////////////////////////////
// Program control and argument parsing
//////////////////////////////////////////////////

program
    .version('0.0.1')
    .usage('[options] <chatlogs> <accountId>')
    .option('-o, --order <order>', 'Sort messages by date in asc or desc order', /^(asc|desc)$/i, 'asc')
    .option('-s, --skip <n>', 'Skip the first <n> number of rows', parseInt)
    .option('-l, --limit <n>', 'Only export at most <n> number of rows', parseInt)
    .option('-d, --debug', 'Run in debug mode')
    .option('-n, --line-numbers', 'Show line numbers')
    .option('-a, --output-file <outFile>', 'The name of the output file html', 'index.html')
    .option('-h, --header', 'Show header')
    .option('-t, --tag <tag>', 'Contact name', '');

program.on('--help', function () {
    console.log('  Arguments:');
    console.log('');
    console.log('    accountId      The iMessage phone number or email address to pull records for. IE: +15554443333');
    console.log('    chatlogs       The database file. IE: .\\3d0d7e5fb2ce288813306e4d4636395e047a3d28 ');
    console.log('');
});

program.parse(process.argv);

if (program.args.length <= 1) {
    console.error("Invalid arguments.  AccountId and Chatlogs are required");
    process.exit(1);
}

//This is the format of handle_id stored in the chat_handle_join table.
scope.handle = 'iMessage;-;' + program.args[1];
scope.contact_name = program.tag;
scope.contact_number = program.args[1];
scope.show_numbers = program.lineNumbers;
scope.header = program.header;

if (program.debug === true) {
    //Enable verbose stack traces
    sqlite3.verbose();
}

dbPath = program.args[0];
db = new sqlite3.Database(dbPath);

//////////////////////////////////////////////////
//  Build the Query
//////////////////////////////////////////////////
var query = "SELECT m.ROWID, m.is_from_me, m.text "
    + "FROM message m "
    + "WHERE m.handle_id=("
    + "SELECT handle_id FROM chat_handle_join WHERE chat_id=("
    + "SELECT ROWID FROM chat WHERE guid = ?"
    + ")"
    + ")";

if (program.order) {
    query += " ORDER BY date " + program.order;
}

if (program.limit) {
    query += " LIMIT " + program.limit;
}

if (program.skip) {
    if (!program.limit) {
        query += " LIMIT -1";
    }
    query += " OFFSET " + program.skip;
}

stmt = db.prepare(query);

//Clear the screen
readline.cursorTo(process.stdout, 0, 0);
readline.clearScreenDown(process.stdout);

//////////////////////////////////////////////////
// Run the query and build the output
//////////////////////////////////////////////////
async.waterfall([
    function (asyncCallback) {
        //Create the directory
        startElipsis('Creating output directory');
        //Only create the directory if it doesn't exist
        fs.stat('output', function (dErr) {
            if (dErr && dErr.code === 'ENOENT') {
                fs.mkdir('output', function (err) {
                    if (err) {
                        return asyncCallback(err);
                    }
                });
            }
            else {
                asyncCallback(null);
            }
        });
    },
    function (asyncCallback) {
        startElipsis('Fetching rows from the database');
        stmt.all(scope.handle, function (err, rows) {
            if (err) {
                return asyncCallback(err);
            }
            //newline of output
            rl.write('\n');
            rl.write('Retrieved ' + rows.length + ' records.\n');
            asyncCallback(null, rows);
        });
        stmt.finalize();
        //Clean up
        db.close();
    },
    function (messages, asyncCallback) {
        var rowNum = program.skip || 0;
        async.eachSeries(messages, function (message, eachCallback) {
            message.rowNum = rowNum;
            rowNum++;
            eachCallback();
        }, function () {
            asyncCallback(null, messages);
        });
    },
    function (results, asyncCallback) {
        //Load the handlebars template.
        startElipsis('Loading template');
        fs.readFile('templates/default.hbs', 'utf-8', function (err, source) {
            if (err) {
                return asyncCallback(err);
            }
            rl.write('Template Loaded.\n');
            //This is the handlebars scope object
            results = results.filter((v, i, a) => a.findIndex(t => (t.text === v.text)) === i)
            results = results.filter((result) => { return result.text !== null })
            results = results.filter((result) => { return result.text !== ' ' })
            scope.messages = results;
            //Compile the template
            var template = Handlebars.compile(source);
            var html = template(scope);
            asyncCallback(null, html);
        });
    },
    function (template, asyncCallback) {
        //Write the html to disk
        startElipsis('Writing compiled html to disk');
        fs.writeFile('output/' + program.outputFile, template, function (err) {
            if (err) {
                return asyncCallback(err);
            }
            asyncCallback(err);
        });
    }
], function (err) {
    if (err) {
        console.error('Any error occurred while exporting your messages - ' + err);
    }
    clearInterval(timerId);

    rl.write('Done!\n');
    rl.close();
});

//////////////////////////////////////////////////
// Console Candy...
//////////////////////////////////////////////////
var line = 0;
function startElipsis(statement) {
    clearInterval(timerId);
    var elipsisCount = 0;
    line += 1;
    timerId = setInterval(function () {
        //Clear the line
        readline.cursorTo(process.stdout, 0, line);
        rl.write(statement);
        for (var i = 0; i < elipsisCount % 4; i++) {
            rl.write('.');
        }
        elipsisCount++;
    }, 1000);
}