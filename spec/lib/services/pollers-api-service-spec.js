// Copyright 2016, EMC, Inc.
/* jshint node:true */

"use strict";

describe("Http.Services.Api.Pollers", function () {
    var pollerService;
    var waterline;
    var Errors;
    var Promise;
    var messenger;
    var testMessage;
    var testSubscription;
    
    before("Http.Services.Api.Pollers before", function() {
        helper.setupInjector([
            helper.require("/lib/services/pollers-api-service.js")
        ]);

        waterline = helper.injector.get("Services.Waterline");
        waterline.workitems = {
            needByIdentifier: sinon.stub().resolves(),
            find: sinon.stub().resolves([]),
            create: sinon.stub().resolves(),
            updateByIdentifier: sinon.stub().resolves(),
            destroyByIdentifier: sinon.stub().resolves()
        };
        pollerService = helper.injector.get("Http.Services.Api.Pollers");
        Errors = helper.injector.get("Errors");
        Promise = helper.injector.get('Promise');
        messenger = helper.injector.get('Services.Messenger');
        var Message = helper.injector.get('Message');
        testMessage = new Message({},{},{routingKey:'test.route.key'});
        sinon.stub(testMessage);     
        var Subscription = helper.injector.get('Subscription');
        testSubscription = new Subscription({},{});
        sinon.stub(testSubscription);
    });
    
    beforeEach(function() {
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

    describe("getPollers", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("getPollers")
                .that.is.a("function").with.length(1);
        });

        it("Run getPollers", function() {
            var mockPoller = [{
                id: "4532",
                name: "Pollers.IPMI",
                config: {}
            }];

            waterline.workitems.find.resolves(mockPoller);
            return pollerService.getPollers().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });
        it('should return error if poller informations is not found', function () {
            var mockPollerError = new Errors.NotFoundError("Could not find workitem with identifier");
            waterline.workitems.find.rejects(mockPollerError);
            return pollerService.getPollers().should.be.rejectedWith(mockPollerError);
        });

    });

    describe("getPollersById", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("getPollersById")
            .that.is.a("function").with.length(1);
        });

        it("Run getPollersById", function() {
            var mockPoller = [{
                id: "1234",
                name: "Pollers.IPMI",
                config: {}
            },
            {
                id: "4532",
                name: "Pollers.TEST",
                config: {}
            }];
            waterline.workitems.needByIdentifier.withArgs("4532").resolves(mockPoller[0]);
            waterline.workitems.needByIdentifier.withArgs("1234").resolves(mockPoller[1]);
            return Promise.map(["4532", "1234"], function(id) {
                return pollerService.getPollersById(id);
            }).then(function (pollers) {
                _.forEach(pollers, function(poller, index) {
                    expect(poller).to.deep.equal(mockPoller[index]);
                });
            });
         });

        it("should return error if specific poller info is not found", function () {
            var mockPollerError = new Errors.NotFoundError("Could not find workitem with identifier");
            waterline.workitems.needByIdentifier.rejects(mockPollerError);
            return pollerService.getPollersById().should.be.rejectedWith(mockPollerError);
        });

    });

    describe("getPollerLib", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("getPollerLib")
            .that.is.a("function").with.length(0);
        });

    });

    describe("getPollerLibById", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("getPollerLibById")
            .that.is.a("function").with.length(1);
        });

    });

    describe("postPollers", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("postPollers")
            .that.is.a("function").with.length(1);
        });

        it("Run postPollers", function() {
            var mockPoller = [{
                id: "4532",
                name: "Pollers.IPMI",
                config: {}
            }];
            waterline.workitems.create.resolves(mockPoller);
            return pollerService.postPollers().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });

        it("Throws error when  postPollers runs with invalid input", function() {
            var mockPollerError = new Errors.ValidationError("Validation errors");
            waterline.workitems.create.rejects(mockPollerError);
            return pollerService.postPollers().should.be.rejectedWith(mockPollerError);
        });
    });


    describe("patchPollersById", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("patchPollersById")
            .that.is.a("function").with.length(2);
        });

        it("Run patchPollersById", function() {
            var mockPoller = [{
                id: "4532",
                name: "Pollers.IPMI",
                config: {},
                paused: "true"
            }];
            waterline.workitems.updateByIdentifier.resolves(mockPoller);
            return pollerService.patchPollersById().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });
    });

    describe("patchPollersByIdPause", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("patchPollersByIdPause")
            .that.is.a("function").with.length(1);
        });


        it("Run patchPollersByIdPause", function() {
            var mockPoller = [{
                id: "4532",
                name: "Pollers.IPMI",
                config: {},
                paused: "true"
            }];
            waterline.workitems.updateByIdentifier.resolves(mockPoller);
            return pollerService.patchPollersByIdPause().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });
    });

    describe("patchPollersByIdResume", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("patchPollersByIdResume")
            .that.is.a("function").with.length(1);
        });

        it("Run patchPollersByIdResume", function() {
            var mockPoller = [{
                id: "4532",
                name: "Pollers.IPMI",
                config: {},
                paused: "false"
            }];
            waterline.workitems.updateByIdentifier.resolves(mockPoller);
            return pollerService.patchPollersByIdResume().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });
    });

    describe("deletePollersById", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("deletePollersById")
            .that.is.a("function").with.length(1);
        });
        it("Run deletePollersById", function() {
            var mockDeletedPoller = [];
            waterline.workitems.destroyByIdentifier.resolves(mockDeletedPoller);
            return pollerService.deletePollersById().then(function (pollers) {
                expect(pollers).to.deep.equal(mockDeletedPoller);
            });
        });
    });

    describe("getPollersByIdData", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("getPollersByIdData")
            .that.is.a("function").with.length(1);
        });

        it("Run getPollersByIdData", function() {
            var mockPoller = [{
                id: "1234",
                name: "Pollers.IPMI",
                config: {}
            }];

            return pollerService.getPollersByIdData().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });
    });


    describe("getPollersByIdDataCurrent", function() {
        it("should expose the appropriate methods", function() {
            pollerService.should.have.property("getPollersByIdDataCurrent")
            .that.is.a("function").with.length(1);
        });

        it("Run getPollersByIdDataCurrent", function() {
            var mockPoller = [{
                id: "1234",
                name: "Pollers.IPMI",
                config: {}
            }];

            return pollerService.getPollersByIdDataCurrent().then(function (pollers) {
                expect(pollers).to.deep.equal(mockPoller);
            });
        });
    });
});
