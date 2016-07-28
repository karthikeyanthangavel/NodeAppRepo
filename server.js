var express = require('express');
var app = express();
var fs = require('fs');
var cron = require('node-cron');
var request = require("request");
var cheerio = require('cheerio');
var _ = require('underscore');

//Initializing Knex js ORM
var knex = require('knex')({
    dialect: 'sqlite3',
    connection: {
        filename: './data.db'
    }
});

//creating stock_exchange_master table
knex.schema.createTableIfNotExists('stock_exchange_master', function(table) {
        table.increments('id');
        table.string('name');
    })
    // creating stock table
    .createTableIfNotExists('stock', function(table) {
        table.increments('id');
        table.decimal('value');
        table.decimal('change_percentage');
        table.dateTime('createddate');
        table.integer('stock_exchange_master_id').unsigned().references('stock_exchange_master.id');
    })
    //Insert NASDAQ to master table
    .then(function() {
        getItemIdByKey('stock_exchange_master', 'nasdaq').then(function(result) {
            if (result.length === 0) {
                return knex.insert({
                    name: 'nasdaq'
                }).into('stock_exchange_master');
            }
        });
    })
    // Finally, add a .catch handler for the promise chain
    .catch(function(e) {
        console.error(e);
    });

//scheduled job to scrape NASDAQ stock value and change_percentage from google finance website (https://www.google.com/finance)
var task = cron.schedule('* * * * * *', function() {
    var stock = {}; //object to hold NASDAQ stock
    request('https://www.google.com/finance', function(error, response, html) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(html);
            // Iterate over table elements in the www.google.com/finance
            $("table#sfe-mktsumm tr").each(function(tr_index, tr) {
                if (tr_index === 2) {
                    $(this).find('td').each(function(td_index, td) {
                        if (td_index === 1)
                            stock["name"] = $(this).find("div").text().trim().toLowerCase();
                        if (td_index === 2)
                            stock["value"] = $(this).find("span").text().trim();
                        if (td_index === 3)
                            stock["change"] = $(this).find("span").text().trim();
                    });
                }
            });
            insertStockData(stock);
        } else {
            console.log('run time error when scraping data from website');
        }
    });
});

//get id by key and table name
var getItemIdByKey = function(tableName, key) {
    return knex(tableName).where({
        name: key
    }).select('id')
};

//fetch all stock table items based on the foreign key id of current stockexchange name
var getAllItem = function(primaryKeyId, limit) {
    return knex.where({
        'stock.stock_exchange_master_id': primaryKeyId
    }).select('stock.id', 'stock.value', 'stock.createddate', 'stock.change_percentage').from('stock').orderBy('stock.id', 'desc').limit(limit);
};

//inserting the web scrapped stock data into the "stock" table
var insertStockData = function(item) {
    getItemIdByKey('stock_exchange_master', item.name).then(function(result) {
        knex("stock").insert([{
            value: item.value,
            change_percentage: item.change,
            createddate: new Date(),
            stock_exchange_master_id: result[0].id
        }]).catch(function(error) {
            console.log(error);
        });
    });
};

var getALLRecordCount = function() {
    return knex('stock').count();
}

var getRecordCountByKey = function(tableName, key) {
    return knex(tableName).min(key);
}

//RESTful api to fetch data based on stock exchange name and the limit(number of records)
app.get('/getAllStocksByName/:StockExchangeName/:Limit', function(req, res) {
    var stockExchangeName = req.params.StockExchangeName.toLowerCase();
    var limit = parseInt(req.params.Limit);

    if (stockExchangeName === 'nasdaq') {
        getALLRecordCount().then(function(stockResult) {
            _.each(stockResult[0], function(item, index) {
                if (_.isNumber(item)) {
                    if (parseInt(req.params.Limit) > item) {
                        requestFailedJsonResult(res, 'Request failed. The limit entered is exceeds available records in system')
                    } else {
                        getAllStocksJson(req, res, stockExchangeName, limit);
                    }
                }
            });
        });
    } else {
        requestFailedJsonResult(res, 'StockExchange name should be NASDAQ')
    }
});

//check in the master data table have the requested stock exchage name
var processMasterTableValidation = function(masterResult, res) {}

//Retrive data based on the table
var getAllStocksJson = function(req, res, stockExchangeName, limit) {
    var s_items = []
    if (limit === 0) {
        return emptyResult(res);
    } else {
        getItemIdByKey('stock_exchange_master', stockExchangeName).then(function(result) {
            getAllItem(result[0].id, limit).map(function(row, index) {
                var temp = new Date(row.createddate); //converting timestamp to date
                row.DateTime = temp;
                delete row.createddate;
                s_items.push(row);
                if (index === limit - 1) {
                    var items = {
                        "StockItems": s_items
                    };
                    var root1 = {
                        "Nasdaq": items
                    };
                    var root = {
                        "StockBrokerInc": root1
                    };

                    var jsonResult = JSON.stringify(root);
                    res.contentType('application/json');
                    res.end(jsonResult);
                }
            });
        });
    }
};

//return json result when limit is 0
var emptyResult = function(res) {
    var items = {
        "StockItems": [],
        "Message": "zero result"
    };
    var root1 = {
        "Nasdaq": items
    };
    var root = {
        "StockBrokerInc": root1
    };

    var jsonResult = JSON.stringify(root);
    res.contentType('application/json');
    res.end(jsonResult);
};

//return json result where parameter is wrong
var requestFailedJsonResult = function(res, message) {
    var root1 = {
        "Message": message
    };
    var root = {
        "StockBrokerInc": root1
    };

    var jsonResult = JSON.stringify(root);
    res.contentType('application/json');
    res.end(jsonResult);
}

//nodejs server is running listening at the port 8081
var server = app.listen(8081, function() {
    var host = server.address().address
    var port = server.address().port

    console.log("app listening at http://%s:%s", host, port)
});