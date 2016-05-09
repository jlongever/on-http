// Copyright 2015-2016, EMC, Inc.

"use strict";

describe("Http.Services.Api.Profiles", function () {
    var profileApiService;
    var Errors;
    var workflowApiService;
    var eventsProtocol;
    var waterline;
    var lookupService;
    var messenger;
    var testMessage;
    var testSubscription;
    
    before("Http.Services.Api.Profiles before", function() {
        helper.setupInjector([
            helper.di.simpleWrapper({}, 'TaskGraph.Store'),
            helper.di.simpleWrapper({}, 'TaskGraph.TaskGraph'),
            helper.require("/lib/services/workflow-api-service"),
            helper.require("/lib/services/profiles-api-service")
        ]);
        profileApiService = helper.injector.get("Http.Services.Api.Profiles");
        Errors = helper.injector.get("Errors");
        waterline = helper.injector.get('Services.Waterline');
        waterline.nodes = {
            findByIdentifier: function() {}
        };
        workflowApiService = helper.injector.get("Http.Services.Api.Workflows");
        eventsProtocol = helper.injector.get("Protocol.Events");
        lookupService = helper.injector.get("Services.Lookup");
        messenger = helper.injector.get('Services.Messenger');
        var Message = helper.injector.get('Message');
        testMessage = new Message({},{},{routingKey:'test.route.key'});
        sinon.stub(testMessage);     
        var Subscription = helper.injector.get('Subscription');
        testSubscription = new Subscription({},{});
        sinon.stub(testSubscription);
    });

    beforeEach("Http.Services.Api.Profiles beforeEach", function() {
        this.sandbox = sinon.sandbox.create();
        sinon.stub(messenger, 'subscribe', function(name,id,callback) {
            callback({value:'test'}, testMessage);
            return Promise.resolve(testSubscription);
        });
        sinon.stub(messenger, 'publish').resolves();
        sinon.stub(messenger, 'request').resolves();
    });

    afterEach("Http.Services.Api.Profiles afterEach", function() {
        this.sandbox.restore();
        messenger.publish.restore();
        messenger.subscribe.restore();
        messenger.request.restore();
    });

    it("waitForDiscoveryStart should retry twice if task is not initially online", function() {
        return profileApiService.waitForDiscoveryStart("testnodeid")
        .then(function() {
            expect(subscription.request).to.have.been.calledThrice;
        });
    });

    describe("setLookup", function() {
        var node;
        var query = {
            'ip':'ip',
            'mac':'mac'
        };

        it("setLookup should add IP lookup entry for new node", function() {
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(node);
            this.sandbox.stub(lookupService, 'setIpAddress').resolves();
            return profileApiService.setLookup(query)
            .then(function() {
                expect(lookupService.setIpAddress).to.be.calledOnce;
            });
        });

        it("setLookup does not add IP lookup entry for existing node", function() {
            node = {
                discovered: true
            };
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(node);
            this.sandbox.stub(lookupService, 'setIpAddress').resolves();
            return profileApiService.setLookup(query)
            .then(function() {
                expect(lookupService.setIpAddress).to.not.be.called;
            });
        });

        it("setLookup does not lookup node on missing required query string", function() {
            this.sandbox.stub(lookupService, 'setIpAddress').resolves();
            return profileApiService.setLookup({macs:'macs'})
            .then(function() {
                expect(lookupService.setIpAddress).to.not.be.called;
            });
        });

    });

    describe("getNode", function() {
        var node;

        before("getNode before", function() {
            node = {
                discovered: sinon.stub()
            };
        });

        beforeEach(function() {
            node.discovered.rejects(new Error('override in test'));
            node.discovered.reset();
        });

        it("getNode should create a new node and run discovery", function() {
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(undefined);
            this.sandbox.stub(profileApiService, 'createNodeAndRunDiscovery').resolves();
            return profileApiService.getNode('testmac')
            .then(function() {
                expect(profileApiService.createNodeAndRunDiscovery)
                    .to.have.been.calledWith('testmac');
            });
        });

        it("getNode should run discovery for a pre-existing node with no catalogs", function() {
            var node = {
                discovered: sinon.stub().resolves(false),
                type: 'compute'
            };
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(node);
            this.sandbox.stub(profileApiService, 'runDiscovery').resolves();

            return profileApiService.getNode('testmac')
            .then(function() {
                expect(profileApiService.runDiscovery).to.have.been.calledWith(node);
            });
        });

        it("getNode should do nothing for a node with an active discovery workflow", function() {
            node.discovered.resolves(false);
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(node);
            this.sandbox.stub(profileApiService, 'runDiscovery').resolves();

            return expect(profileApiService.getNode('testmac')).to.become(node);
        });

        it("getNode should do nothing for a node with an active discovery workflow", function() {
            node.discovered.resolves(false);
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(node);
            this.sandbox.stub(profileApiService, 'runDiscovery').resolves();

            return expect(profileApiService.getNode('testmac')).to.become(node);
        });

        it("getNode should do nothing for a node that has already been discovered", function() {
            node.discovered.resolves(true);
            this.sandbox.stub(waterline.nodes, 'findByIdentifier').resolves(node);

            return expect(profileApiService.getNode('testmac')).to.become(node);
        });
    });

    it('should run discovery', function() {
        var node = { id: 'test', type: 'compute' };
        this.sandbox.stub(workflowApiService, 'createAndRunGraph').resolves();
        this.sandbox.stub(profileApiService, 'waitForDiscoveryStart').resolves();
        return profileApiService.runDiscovery(node)
        .then(function(_node) {
            expect(_node).to.equal(node);
            expect(workflowApiService.createAndRunGraph).to.have.been.calledOnce;
            expect(workflowApiService.createAndRunGraph).to.have.been.calledWith({
                name: 'Graph.SKU.Discovery',
                options: {
                    defaults: {
                        graphOptions: {
                            target: node.id
                        },
                        nodeId: node.id
                    }
                }
            });
            expect(profileApiService.waitForDiscoveryStart).to.have.been.calledOnce;
            expect(profileApiService.waitForDiscoveryStart).to.have.been.calledWith(node.id);
        });
    });

    describe("renderProfile", function() {

        it("render profile fail when no active graph and cannot get node bootSettings", function() {
            var node = { id: 'test' , type: 'compute', bootSettings: {}};

            var bootSettingsFailure = {
                context: undefined,
                profile: 'error.ipxe',
                options: {
                    error: 'Unable to retrieve node bootSettings'
                }
            };
            this.sandbox.stub(workflowApiService, 'findActiveGraphForTarget').resolves(undefined);
            
            return profileApiService.renderProfileFromTaskOrNode(node)
            .then(function(result) {
                expect(workflowApiService.findActiveGraphForTarget).to.have.been.calledOnce;
                expect(subscription.request).to.not.be.called;
                expect(result).to.deep.equal(bootSettingsFailure);
            });
        });

        it("render profile pass when no active graphs and node has bootSettings", function() {
            var node = {
                id: 'test',
                type: 'compute',
                bootSettings: {
                    profile: 'profile',
                    options: {}
                }
            };

            this.sandbox.stub(workflowApiService, 'findActiveGraphForTarget').resolves(undefined);
            
            return profileApiService.renderProfileFromTaskOrNode(node)
            .then(function(result) {
                expect(workflowApiService.findActiveGraphForTarget).to.have.been.calledOnce;
                expect(subscription.request).to.not.be.called;
                expect(result).to.deep.equal(node.bootSettings);
            });
        });

        it("render profile fail due to no active graph or there are no bootSettings", function() {
            var node = { id: 'test', type: 'compute' };
            var activeGraphFailure = {
                context: undefined,
                profile: 'error.ipxe',
                options: {
                    error: 'Unable to locate active workflow or there are no bootSettings'
                }
            };
            this.sandbox.stub(workflowApiService, 'findActiveGraphForTarget').resolves(undefined);
            
            return profileApiService.renderProfileFromTaskOrNode(node)
            .then(function(result) {
                expect(workflowApiService.findActiveGraphForTarget).to.have.been.calledOnce;
                expect(subscription.request).to.not.be.called;
                expect(result).to.deep.equal(activeGraphFailure);
            });
        });

        it("render profile pass when having active graph and render succeed", function() {
            var node = { id: 'test', type: 'compute' };
            var graph = { context: {} };

            this.sandbox.stub(workflowApiService, 'findActiveGraphForTarget').resolves(graph);
            
            return profileApiService.renderProfileFromTaskOrNode(node)
            .then(function(result) {
                expect(workflowApiService.findActiveGraphForTarget).to.have.been.calledOnce;
                expect(subscription.request).to.have.been.calledOnce;
                expect(subscription.request).to.have.been.calledOnce;
                expect(result).to.deep.equal({
                    context: graph.context,
                    profile: 'profile',
                    options: { kargs: null }
                });
            });
        });

        it("render profile fail when retrieve workflow properties fail", function() {
            var node = { id: 'test', type: 'compute' };
            var retrieveProperitesFailure = {
                context: undefined,
                profile: 'error.ipxe',
                options: {
                    error: 'Unable to retrieve workflow properties'
                }
            };

            this.sandbox.stub(workflowApiService, 'findActiveGraphForTarget').resolves(true);
            
            return profileApiService.renderProfileFromTaskOrNode(node)
            .then(function(result) {
                expect(workflowApiService.findActiveGraphForTarget).to.have.been.calledOnce;
                expect(subscription.request).to.have.been.calledOnce;
                expect(subscription.request).to.have.been.calledOnce;
                expect(result).to.deep.equal(retrieveProperitesFailure);
            });
        });

    });
});
