// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di');
var ejs = require('ejs');

module.exports = taskApiServiceFactory;
di.annotate(taskApiServiceFactory, new di.Provide('Http.Services.Api.Tasks'));
di.annotate(taskApiServiceFactory,
    new di.Inject(
        'Result',
        'Assert',
        'Constants',
        'Services.Messenger',
        'Services.Waterline',
        'Errors',
        'Util',
        'Services.Configuration',
        'Services.Lookup',
        'Services.Environment',
        'Promise',
        'Templates'
    )
);
function taskApiServiceFactory(
    Result,
    assert,
    Constants,
    messenger,
    waterline,
    Errors,
    util,
    configuration,
    lookupService,
    Env,
    Promise,
    templates
) {

    function NoActiveTaskError(message) {
        NoActiveTaskError.super_.call(this, message);
        Error.captureStackTrace(this, NoActiveTaskError);
    }
    util.inherits(NoActiveTaskError, Errors.BaseError);

    function TaskApiService() {
        this.NoActiveTaskError = NoActiveTaskError;
    }

    TaskApiService.prototype.getNode = function(macAddress) {
        macAddress = macAddress || '';
        macAddress = macAddress.toLowerCase();
        return waterline.nodes.findByIdentifier(macAddress);
    };

    TaskApiService.prototype.getTasks = function(identifier) {
        var self = this;
        return self.activeTaskExists(identifier)
        .catch(function() {
            throw new self.NoActiveTaskError('');
        })
        .then(function() {
            return self.requestCommands(identifier);
        });
    };
    
    TaskApiService.prototype.postTasksById = function(id, body) {
        return self.respondCommands(id, body);
    };
    
    TaskApiService.prototype.getBootstrap = function (req, res, macAddress) {
        var scope = res.locals.scope;
        return this.getNode(macAddress).then(function (node) {
                if (node) {

                    var promises = [
                        Promise.props({
                            identifier: node.id,
                            server: configuration.get('apiServerAddress', '10.1.1.1'),
                            port: configuration.get('apiServerPort', 80),
                            ipaddress: res.locals.ipAddress,
                            netmask: configuration.get('dhcpSubnetMask', '255.255.255.0'),
                            gateway: configuration.get('dhcpGateway', '10.1.1.1'),
                            macaddress: lookupService.ipAddressToMacAddress(res.locals.ipAddress),
                            sku: Env.get('config', {}, [scope[0]]),
                            env: Env.get('config', {}, scope)
                        }),
                        templates.get('bootstrap.js', scope),
                    ];

                    return Promise.all(promises).spread(function (options, template) {
                        return ejs.render(template.contents, options);
                    });
                } else {
                    throw new Errors.NotFoundError('Node not found');
                }
            });
    };
    
    TaskApiService.prototype.respondCommands = function respondCommands(id, data) {
        assert.string(id);

        return messenger.publish(
            Constants.Protocol.Exchanges.Task.Name,
            'methods.respondCommands' + '.' + id,
            new Result({ value: data })
        );
    };
    
    TaskApiService.prototype.activeTaskExists = function (target) {
        assert.string(target);

        return messenger.request(
            Constants.Protocol.Exchanges.Task.Name,
            'methods.activeTaskExists' + '.' + target,
            {}
        ).then(function (data) {
            return data.value;
        });
    };
    
    TaskApiService.prototype.requestCommands = function requestCommands(id, args) {
        return messenger.request(
            Constants.Protocol.Exchanges.Task.Name,
            'methods.requestCommands' + '.' + id,
            args || {}
        ).then(function (data) {
            return data.value;
        });
    };
    
    TaskApiService.prototype.requestProperties = function requestProperties(id, args) {
        return messenger.request(
            Constants.Protocol.Exchanges.Task.Name,
            'methods.requestProperties' + '.' + id,
            args || {}
        ).then(function (data) {
            return data.value;
        });
    };

    return new TaskApiService();
}
