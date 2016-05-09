// Copyright 2015-2016, EMC, Inc.

'use strict';

describe('Http.Api.Profiles', function () {
    var workflowApiService;
    var messenger;
    var testMessage;
    var testSubscription;
    var lookupService;
    var profiles;
    var presenter;
    var profileApiService;
    var Errors;

    before('start HTTP server', function () {
        this.timeout(5000);
        messenger = helper.injector.get('Services.Messenger');
        var Message = helper.injector.get('Message');
        testMessage = new Message({},{},{routingKey:'test.route.key'});
        sinon.stub(testMessage);
                
        var Subscription = helper.injector.get('Subscription');
        testSubscription = new Subscription({},{});
        sinon.stub(testSubscription);
        return helper.startServer([]);
    });

    beforeEach('set up mocks', function () {
        lookupService = helper.injector.get('Services.Lookup');
        Errors = helper.injector.get('Errors');

        sinon.stub(lookupService, 'ipAddressToMacAddress').resolves('00:00:00:00:00:00');

        workflowApiService = helper.injector.get('Http.Services.Api.Workflows');
        sinon.stub(workflowApiService, 'findActiveGraphForTarget').resolves({});
        sinon.stub(workflowApiService, 'createActiveGraph').resolves({ instanceId: 'test' });

        presenter = helper.injector.get('common-api-presenter');

        profiles = helper.injector.get('Profiles');
        sinon.stub(profiles, 'getAll').resolves([]);
        sinon.stub(profiles, 'get').resolves('');
        sinon.stub(profiles, 'put').resolves();

        profileApiService = helper.injector.get('Http.Services.Api.Profiles');
        sinon.stub(profileApiService, 'getNode').resolves({});
        sinon.stub(profileApiService, 'createNodeAndRunDiscovery').resolves({});
        sinon.stub(profileApiService, 'runDiscovery').resolves({});
        sinon.stub(profileApiService, 'setLookup').resolves();
        
        sinon.stub(messenger, 'subscribe', function(name,id,callback) {
            callback({value:'test'}, testMessage);
            return Promise.resolve(testSubscription);
        });
        sinon.stub(messenger, 'publish').resolves();
    });

    afterEach('teardown mocks', function () {
        function resetMocks(obj) {
            _(obj).methods().forEach(function (method) {
                if (typeof obj[method].restore === 'function') {
                    obj[method].restore();
                }
            }).value();
        }
        resetMocks(lookupService);
        resetMocks(workflowApiService);
        resetMocks(presenter.CommonApiPresenter.prototype);
        resetMocks(profiles);
        resetMocks(profileApiService);
        messenger.publish.restore();
        messenger.subscribe.restore();
    });

    after('stop HTTP server', function () {
        return helper.stopServer();
    });

    var profile = {
        id: '1234abcd5678effe9012dcba',
        name: 'dummy profile',
        contents: '#!ipxe\n'
    };

    describe('GET /profiles/library', function () {
        it('should return a list of profiles', function () {
            profiles.getAll.resolves([profile]);
            return helper.request().get('/api/1.1/profiles/library')
            .expect('Content-Type', /^application\/json/)
            .expect(200, [profile])
            .then(function () {
                expect(profiles.getAll).to.have.been.calledOnce;
            });
        });
    });


    describe('GET /profiles/library/:id', function () {
        it('should return a single profile', function () {
            profiles.get.resolves(profile);
            return helper.request().get('/api/1.1/profiles/library/123')
            .expect('Content-Type', /^application\/json/)
            .expect(200, profile)
            .then(function () {
                expect(profiles.get).to.have.been.calledOnce;
                expect(profiles.get).to.have.been.calledWith('123');
            });
        });
    });

    describe('PUT /profiles/library/:id', function () {
        it('should save a profile (octet-stream)', function () {
            profiles.put.resolves();
            return helper.request().put('/api/1.1/profiles/library/123')
            .set('Content-Type', 'application/octet-stream')
            .send('echo\n')
            .expect(200)
            .then(function () {
                expect(profiles.put).to.have.been.calledOnce;
                expect(profiles.put).to.have.been.calledWith('123');
                expect(profiles.put.firstCall.args[1]).to.deep.equal('echo\n');
            });
        });

        it('should save a profile (text/plain)', function () {
            profiles.put.resolves();
            return helper.request().put('/api/1.1/profiles/library/123')
            .set('Content-Type', 'text/plain')
            .send('echo\n')
            .expect(200)
            .then(function () {
                expect(profiles.put).to.have.been.calledOnce;
                expect(profiles.put).to.have.been.calledWith('123');
                //console.log(profiles.put.firstCall.args[1]);
                expect(profiles.put.firstCall.args[1]).to.deep.equal('echo\n');
            });
        });

        it('should 500 error when profiles.put() fails', function () {
            profiles.put.rejects(new Error('dummy'));
            return helper.request().put('/api/1.1/profiles/library/123')
            .send('test_profile_cmd\n')
            .expect('Content-Type', /^application\/json/)
            .expect(500);
        });
    });

    describe("GET /profiles", function() {
        it("should receive both mac and ip query", function() {
            return helper.request().get('/api/1.1/profiles?mac=00:01:02:03:04:05&&ip=1.1.1.1')
                .expect(200)
                .expect(function() {
                    expect(profileApiService.setLookup).to.have.been.calledOnce;
                });
        });

        it("should send 500 set mac and ip fails", function() {
            profileApiService.setLookup.rejects(new Error('error'));
            return helper.request().get('/api/1.1/profiles?mac=00:01:02:03:04:05&&ip=1.1.1.1')
                .expect(500);
        });

        it("should call getNode with a compute node type", function() {
            return helper.request().get('/api/1.1/profiles')
                .query({ macs: [ '00:01:02:03:04:05' ] })
                .expect(200)
                .expect(function() {
                    expect(profileApiService.getNode).to.have.been.calledWith(
                        [ '00:01:02:03:04:05' ],
                        { type: 'compute' }
                    );
                });
        });

        it("should send down redirect.ipxe if 'macs' are not in req.query", function() {
            profileApiService.getNode.restore();
            return helper.request().get('/api/1.1/profiles')
                .expect(200)
                .expect(function() {
                    expect(profiles.get).to.have.been.calledWith('redirect.ipxe');
                });
        });

        it("should send down redirect.ipxe if a node is new", function() {
            profileApiService.getNode.restore();
            profileApiService.createNodeAndRunDiscovery.restore();
            return helper.request().get('/api/1.1/profiles')
                .query({ macs: '00:00:de:ad:be:ef' })
                .expect(200)
                .expect(function() {
                    expect(profiles.get).to.have.been.calledWith('redirect.ipxe');
                });
        });

        it("should send a 500 if profileApiService.getNode fails", function() {
            profileApiService.getNode.rejects(new Error('asdf'));

            return helper.request().get('/api/1.1/profiles')
                .query({ macs: '00:00:de:ad:be:ef' })
                .expect(500);
        });

        it("should send down error.ipxe for a known node with no active graph", function() {
            profileApiService.createNodeAndRunDiscovery.resolves({});
            profileApiService.getNode.resolves({});
            workflowApiService.findActiveGraphForTarget.resolves(null);

            return helper.request().get('/api/1.1/profiles')
                .query({ macs: '00:00:de:ad:be:ef' })
                .expect(200)
                .expect(function() {
                    expect(profiles.get).to.have.been.calledWith('error.ipxe');
                });
        });

        it("should send down error.ipxe on failing to retrieve workflow properties", function() {
            profileApiService.createNodeAndRunDiscovery.resolves({});
            profileApiService.getNode.resolves({});
            workflowApiService.findActiveGraphForTarget.resolves({});

            return helper.request().get('/api/1.1/profiles')
                .query({ macs: '00:00:de:ad:be:ef' })
                .expect(200)
                .expect(function() {
                    expect(profiles.get).to.have.been.calledWith('error.ipxe');
                });
        });

        it("should send down a task specific bootfile for a node with an active task", function() {
            profileApiService.createNodeAndRunDiscovery.resolves({});
            profileApiService.getNode.resolves({});
            workflowApiService.findActiveGraphForTarget.resolves({});

            return helper.request().get('/api/1.1/profiles')
                .query({ macs: '00:00:de:ad:be:ef' })
                .expect(200)
                .expect(function() {
                    expect(profiles.get).to.have.been.calledWith('test.profile');
                });
        });
    });

    describe("GET /profiles/switch/:vendor", function() {
        it("should send down taskrunner.py", function() {
            sinon.spy(presenter.CommonApiPresenter.prototype, 'renderProfile');
            var _renderProfileSpy = presenter.CommonApiPresenter.prototype.renderProfile;
            profileApiService.getNode.resolves({
                id: 'testid',
                type: 'switch'
            });

            return helper.request().get('/api/1.1/profiles/switch/testswitchvendor')
                .expect(200)
                .expect(function() {
                    expect(_renderProfileSpy).to.have.been.calledWith(
                        'taskrunner.py',
                        { identifier: 'testid' }
                    );
                });
        });

        it("should send a 500 if profileApiService.getNode fails", function() {
            profileApiService.getNode.rejects(new Error('test'));

            return helper.request().get('/api/1.1/profiles/switch/testswitchvendor')
                .expect(500);
        });

        it("should return a 400 for a known node with no active graph", function() {
            profileApiService.getNode.resolves({ type: 'switch' });
            workflowApiService.findActiveGraphForTarget.resolves(null);

            return helper.request().get('/api/1.1/profiles/switch/testswitchvendor')
                .expect(400, /Unable to locate active workflow/);
        });

        it("should return a 500 on failing to retrieve workflow properties", function() {
            profileApiService.getNode.resolves({ type: 'switch' });
            workflowApiService.findActiveGraphForTarget.resolves({});

            return helper.request().get('/api/1.1/profiles/switch/testswitchvendor')
                .expect(500, /Unable.*properties/);
        });

        it("should return a task specific profile for a switch with an active task", function() {
            profileApiService.getNode.resolves({ type: 'switch' });
            workflowApiService.findActiveGraphForTarget.resolves({});
            return helper.request().get('/api/1.1/profiles/switch/testswitchvendor')
                .expect(200)
                .expect(function() {
                    expect(profiles.get).to.have.been.calledWith('test.profile');
                });
        });

        it("should throw a 400 on a request from an unknown switch vendor", function() {
            profileApiService.getNode.restore();
            profileApiService.createNodeAndRunDiscovery.restore();
            profileApiService.runDiscovery.restore();
            return helper.request().get('/api/1.1/profiles/switch/unknown')
                .expect(400, /Unknown.*vendor/);
        });
    });
});
