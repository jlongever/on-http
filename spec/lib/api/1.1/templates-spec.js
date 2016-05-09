// Copyright 2015, EMC, Inc.
/* jshint node:true */

'use strict';

describe('Http.Api.Templates', function () {
    var templates;
    var configuration;
    var lookupService;
    var workflowApiService;
    var waterline;
    var environment;
    var messenger;
    var testMessage;
    var testSubscription;
    
    before('start HTTP server', function () {
        this.timeout(5000);
        templates = {
            load: sinon.stub()
        };
        workflowApiService = {};
        waterline = {
            start: sinon.stub(),
            stop: sinon.stub(),
            lookups: {
                setIndexes: sinon.stub()
            }
        };
        environment = {
            start: sinon.stub(),
            stop: sinon.stub(),
            get: sinon.stub()
        };
        messenger = helper.injector.get('Services.Messenger');
        var Message = helper.injector.get('Message');
        testMessage = new Message({},{},{routingKey:'test.route.key'});
        sinon.stub(testMessage);     
        var Subscription = helper.injector.get('Subscription');
        testSubscription = new Subscription({},{});
        sinon.stub(testSubscription);

        return helper.startServer([
            dihelper.simpleWrapper(templates, 'Templates'),
            dihelper.simpleWrapper(workflowApiService, 'Http.Services.Api.Workflows'),
            dihelper.simpleWrapper(waterline, 'Services.Waterline'),
            dihelper.simpleWrapper(environment, 'Services.Environment')
        ]);
    });

    after('stop HTTP server', function () {
        return helper.stopServer();
    });

    beforeEach('set up mocks', function () {
        templates.getAll = sinon.stub().resolves();
        templates.get = sinon.stub().resolves();
        templates.put = sinon.stub().resolves();

        configuration = helper.injector.get('Services.Configuration');
        lookupService = helper.injector.get('Services.Lookup');
        lookupService.ipAddressToMacAddress = sinon.stub().resolves();
        lookupService.ipAddressToNodeId = sinon.stub().resolves();
        workflowApiService.findActiveGraphForTarget = sinon.stub().resolves();
        waterline.nodes = {
            findByIdentifier: sinon.stub().resolves()
        };
        environment.get.resolves({});
        sinon.stub(messenger, 'subscribe', function(name,id,callback) {
            callback({value:'test'}, testMessage);
            return Promise.resolve(testSubscription);
        });
        sinon.stub(messenger, 'publish').resolves();
    });
    
    afterEach(function() {
        messenger.publish.restore();
        messenger.subscribe.restore();
    });

    var template = {
        id: '1234abcd5678effe9012dcba',
        name: 'dummy template',
        contents: 'reboot\n'
    };

    describe('GET /templates/library', function () {
        it('should return a list of templates', function () {
            templates.getAll.resolves([template]);
            return helper.request().get('/api/1.1/templates/library')
            .expect('Content-Type', /^application\/json/)
            .expect(200, [template])
            .then(function () {
                expect(templates.getAll).to.have.been.calledOnce;
            });
        });
    });


    describe('GET /templates/library/:id', function () {
        it('should return a single template', function () {
            templates.get.resolves(template);
            return helper.request().get('/api/1.1/templates/library/123')
            .expect('Content-Type', /^application\/json/)
            .expect(200, template)
            .then(function () {
                expect(templates.get).to.have.been.calledOnce;
                expect(templates.get).to.have.been.calledWith('123');
            });
        });
    });

    describe('PUT /templates/library/:id', function () {
        it('should save a template (octet-stream)', function () {
            templates.put.resolves();
            return helper.request().put('/api/1.1/templates/library/123')
            .set('Content-Type', 'application/octet-stream')
            .send('test_template_cmd\n')
            .expect(200)
            .then(function () {
                expect(templates.put).to.have.been.calledOnce;
                expect(templates.put).to.have.been.calledWith('123');
                expect(templates.put.firstCall.args[1]).to.deep.equal('test_template_cmd\n');
            });
        });


        it('should save a template (text/plain)', function () {
            templates.put.resolves();
            return helper.request().put('/api/1.1/templates/library/123')
            .set('Content-Type', 'text/plain')
            .send('test_template_cmd\n')
            .expect(200)
            .then(function () {
                expect(templates.put).to.have.been.calledOnce;
                expect(templates.put).to.have.been.calledWith('123');
                expect(templates.put.firstCall.args[1]).to.deep.equal('test_template_cmd\n');
            });
        });

        it('should 500 error when templates.put() fails', function () {
            templates.put.rejects(new Error('dummy'));
            return helper.request().put('/api/1.1/templates/library/123')
            .send('test_template_cmd\n')
            .expect('Content-Type', /^application\/json/)
            .expect(500);
        });
    });

    describe('GET /templates/:id', function () {
        function templateRequest(input, output) {
            lookupService.ipAddressToMacAddress.resolves('01:23:45:ab:cd:ef');
            waterline.nodes.findByIdentifier.resolves({ id: '01ab23cd45ef67fe89dc00ba' });
            workflowApiService.findActiveGraphForTarget.resolves({});
            templates.get.resolves({ contents: input });

            return helper.request().get('/api/1.1/templates/test_template')
            .expect('Content-Type', /^text\/html/)
            .expect(200, output);
        }

        it('should succeed with an existing DHCP lease, node and template', function () {
            return templateRequest('test_cmd', 'test_cmd')
            .expect(function () {
                expect(templates.get).to.have.been.calledWith('test_template');
            });
        });

        it('should render a template with the server', function () {
            return templateRequest(
                '<%= server %>',
                configuration.get('apiServerAddress', '10.1.1.1')
            );
        });

        it('should render a template with the http port', function () {
            return templateRequest(
                '<%= port %>',
                configuration.get('apiServerPort', 80).toString()
            );
        });

        it('should render a template with the request IP', function () {
            return templateRequest(
                '<%= ipaddress %>',
                '127.0.0.1'
            );
        });

        it('should render a template with the subnet mask', function () {
            return templateRequest(
                '<%= netmask %>',
                configuration.get('dhcpSubnetMask', '255.255.255.0')
            );
        });

        it('should render a template with the gateway IP', function () {
            return templateRequest(
                '<%= gateway %>',
                configuration.get('dhcpGateway', '10.1.1.1')
            );
        });

        it('should render a template with the MAC address', function () {
            return templateRequest(
                '<%= macaddress %>',
                '01:23:45:ab:cd:ef'
            );
        });

        it('should render a template with a custom task property', function () {
            return templateRequest(
                '<%= myprop %>',
                'foobar'
            );
        });

        it('should 500 error if the request IP does not have a DHCP lease', function () {
            lookupService.ipAddressToMacAddress.resolves(undefined);

            return helper.request().get('/api/1.1/templates/test_template')
            .expect('Content-Type', /^application\/json/)
            .expect(500, /Unable to look up the relevant node from the request/);
        });

        it('should 500 error if the node does not exist', function () {
            lookupService.ipAddressToMacAddress.resolves('01:23:45:ab:cd:ef');
            waterline.nodes.findByIdentifier.resolves(undefined);

            return helper.request().get('/api/1.1/templates/test_template')
            .expect('Content-Type', /^application\/json/)
            .expect(500, /Cannot render template for node with mac/);
        });

        it('should 500 error if the node does not have an active task graph', function () {
            lookupService.ipAddressToMacAddress.resolves('01:23:45:ab:cd:ef');
            waterline.nodes.findByIdentifier.resolves({ id: '01ab23cd45ef67fe89dc00ba' });
            workflowApiService.findActiveGraphForTarget.resolves(undefined);

            return helper.request().get('/api/1.1/templates/test_template')
            .expect('Content-Type', /^application\/json/)
            .expect(500, /Unable to find active graph for node/);
        });

        it('should 500 error if the template contains syntax errors', function () {
            lookupService.ipAddressToMacAddress.resolves('01:23:45:ab:cd:ef');
            waterline.nodes.findByIdentifier.resolves({ id: '01ab23cd45ef67fe89dc00ba' });
            workflowApiService.findActiveGraphForTarget.resolves({});
            templates.get.resolves({ contents: 'test_cmd<%adb-34n.cif}d%>\n' });

            return helper.request().get('/api/1.1/templates/test_template')
            .expect('Content-Type', /^application\/json/)
            .expect(500, /SyntaxError/);
        });
    });
});
