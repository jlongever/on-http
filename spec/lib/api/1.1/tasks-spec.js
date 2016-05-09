// Copyright 2015, EMC, Inc.
/* jshint node:true */

'use strict';

describe('Http.Api.Tasks', function () {
    var tasksApiService;
    var lookupService;
    var templates;
    var messenger;
    var testMessage;
    var testSubscription;
    var Constants;
    
    before('start HTTP server', function () {
        this.timeout(5000);
        messenger = helper.injector.get('Services.Messenger');
        var Message = helper.injector.get('Message');
        testMessage = new Message({},{},{routingKey:'test.route.key'});
        sinon.stub(testMessage);     
        var Subscription = helper.injector.get('Subscription');
        testSubscription = new Subscription({},{});
        sinon.stub(testSubscription);
        Constants = helper.injector.get('Constants');
        return helper.startServer();
    });

    beforeEach('set up mocks', function () {
        tasksApiService = helper.injector.get('Http.Services.Api.Tasks');
        tasksApiService.getNode = sinon.stub();

        lookupService = helper.injector.get('Services.Lookup');
        lookupService.ipAddressToMacAddress = sinon.stub().resolves('00:11:22:33:44:55');

        templates = helper.injector.get('Templates');
        sinon.stub(messenger, 'subscribe', function(name,id,callback) {
            callback({value:'test'}, testMessage);
            return Promise.resolve(testSubscription);
        });
        sinon.stub(messenger, 'publish').resolves();
        return helper.reset();
    });

    afterEach(function() {
        messenger.publish.restore();
        messenger.subscribe.restore();
    });

    after('stop HTTP server', function () {
        return helper.stopServer();
    });

    describe('GET /tasks/:id', function () {
        it("should send down tasks", function() {
            return helper.request().get('/api/1.1/tasks/testnodeid')
            .expect(200)
            .expect(function (res) {
                expect(res.body).to.deep.equal({ testcommands: 'cmd' });
            });
        });

        it("should return 204 if no active task exists", function() {
            var tasksApiService = helper.injector.get('Http.Services.Api.Tasks');
            return helper.request().get('/api/1.1/tasks/testnodeid')
            .expect(204)
            .expect(function (res) {
                expect(res.body).to.be.empty;
            });
        });

        it("should error if an active task exists but no commands are sent", function() {
            return helper.request().get('/api/1.1/tasks/testnodeid')
            .expect(404)
            .expect(function (res) {
                expect(res.body).to.be.empty;
            });
        });


    });

    describe("GET /tasks/bootstrap.js", function() {
        var stubTemplates;

        before(function() {
            stubTemplates = sinon.stub(templates, 'get');
            stubTemplates.withArgs('bootstrap.js').resolves({
                contents: 'test contents'
            });
        });

        after(function() {
            stubTemplates.restore();
        });

       it("should render a bootstrap for the node", function() {
            tasksApiService.getNode.resolves({ id: '123' });
            return helper.request().get('/api/1.1/tasks/bootstrap.js?macAddress=00:11:22:33:44:55')
                .expect(200)
                .expect(function (res) {
                    expect(tasksApiService.getNode).to.have.been.calledWith('00:11:22:33:44:55');
                    expect(res.text).to.equal('test contents');
                });
        });

        it("should render a 404 if node not found", function() {
            tasksApiService.getNode.resolves(null);
            return helper.request()
                .get('/api/1.1/tasks/bootstrap.js?macAddress=00:11:22:33:44:55')
                .expect(404);
        });

        it("should render a 500 if tasksApiService.getNode errors", function() {
            tasksApiService.getNode.rejects(new Error('asdf'));
            return helper.request()
                .get('/api/1.1/tasks/bootstrap.js?macAddress=00:11:22:33:44:55')
                .expect(500);
        });
    });

    describe("POST /tasks/:id", function () {
        it("should accept a large entity response", function() {
            function createBigString() {
                var x = "";
                for (var i = 0; i < 200000; i+=1) {
                    x += "1";
                }
                return x;
            }

            var data = { foo: createBigString() };

            return helper.request().post('/api/1.1/tasks/123')
            .send(data)
            .expect(function () {
                expect(messenger.subscribe).to.have.been.calledWith(
                    Constants.Protocol.Exchanges.Task.Name,
                    'methods.respondCommands.123'
                );
            })
            .expect(201);
        });
    });
});
