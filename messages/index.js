"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");

var useEmulator = (process.env.NODE_ENV == 'development');

var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});
var bot = new builder.UniversalBot(connector, function (session){
    session.send("Say 'order pizza' to start a new order. ");
});

// Add dialog for continuing previous order
bot.dialog('continueOrderDialog', [
    function (session, args, next) {
        // Check for saved order
        if (session.userData.previousCart) {
            // Check for existing order
            if (session.userData.cart && session.userData.cart.length > 0) {
                // Prompt user to confirm
                builder.Prompts.confirm(session, "This will replace the current order. Are you sure?");
            } else {
                // Just answer yes to prompt
                next({ response: true });
            }
        } else {
            // Send no order message and re-prompt 
            session.send("No saved order to continue.").endDialogWithResult({ resumed: builder.ResumeReason.reprompt });
        }
    },
    function(session, result) {
        if (result.response) {
            // Restore previous order
            session.userData.cart = session.userData.previousCart;
            delete session.userData.previousCart;

            // Show user cart
            session.beginDialog('viewCartDialog');
        } else {
            // End dialog and re-prompt
            session.endDialogWithResult({ resumed: builder.ResumeReason.reprompt });
        }
    },
    function (session) {
        // Start orderPizzaDialog in continue mode
        session.clearDialogStack();
        session.beginDialog('orderPizzaDialog', { continueOrder: true });
    }
]).triggerAction({
    matches: /continue.*order/i,
    onSelectAction: function (session, args, next) {
        // Default behavior is to interrupt the current dialog. Let's change
        // that to push onto the stack instead. This lets us confirm replacing
        // a current order with the older one.
        // - For trigger actions, args.action is the ID of the triggered dialog. 
        session.beginDialog(args.action, args);
    }
});

// Add dialog to manage ordering a pizza
bot.dialog('orderPizzaDialog', [
    function (session, args) {
        if (!args.continueOrder) {
            session.userData.cart = [];
            session.send("At anytime you can say 'cancel order', 'view cart', or 'checkout'.")
        }
        builder.Prompts.choice(session, "What would you like to add?", "Pizza|Drinks|Extras");
    },
    function (session, results) {
        session.beginDialog('add' + results.response.entity);
    },
    function (session, results) {
        if (results.response) {
            session.userData.cart.push(results.response);
        }
        session.replaceDialog('orderPizzaDialog', { continueOrder: true });
    }
]).triggerAction({ 
        matches: /order.*pizza/i,
        onInterrupted: function (session, dialogId, dialogArgs, next) {
            // Save off any existing order prior to interruption
            var cart = session.userData.cart;
            if (cart && cart.length > 0) {
                // Save off order and tell user how to continue
                session.userData.previousCart = cart;
                session.send("Order saved. To continue just say 'continue order'.");
            }
            next();
        }
  })
  .cancelAction('cancelOrderAction', "Order canceled.", { 
      matches: /(cancel.*order|^cancel)/i,
      confirmPrompt: "Are you sure?"
  })
  .beginDialogAction('viewCartAction', 'viewCartDialog', { matches: /view.*cart/i })
  .beginDialogAction('checkoutAction', 'checkoutDialog', { matches: /checkout/i });

// Add pizza menu option
bot.dialog('addPizza', [
    function (session) {
        builder.Prompts.choice(session, "What kind of pizza?", "Hawaiian|Meat Lovers|Supreme");
    },
    function (session, results) {
        session.dialogData.pizza = results.response.entity;
        builder.Prompts.choice(session, "What size?", 'Small 8"|Medium 10"|Large 12"');
    },
    function (session, results) {
        var item = results.response.entity + ' ' + session.dialogData.pizza + ' Pizza';
        session.endDialogWithResult({ response: item });
    }
]).cancelAction('cancelItemAction', "Item canceled.", { matches: /(cancel.*item|^cancel)/i });

// Add drink menu option
bot.dialog('addDrinks', [
    function (session) {
        builder.Prompts.choice(session, "What kind of 2 Liter drink?", "Coke|Sprite|Pepsi");
    },
    function (session, results) {
        session.endDialogWithResult({ response: '2 Liter ' + results.response.entity });
    }
]).cancelAction('cancelItemAction', "Item canceled.", { matches: /(cancel.*item|^cancel)/i });

// Add extras menu option
bot.dialog('addExtras', [
    function (session) {
        builder.Prompts.choice(session, "What kind of extra?", "Salad|Breadsticks|Wings");
    },
    function (session, results) {
        session.endDialogWithResult({ response: results.response.entity });
    }
]).cancelAction('cancelItemAction', "Item canceled.", { matches: /(cancel.*item|^cancel)/i });

// Dialog for showing the users cart
bot.dialog('viewCartDialog', function (session) {
    var msg;
    var cart = session.userData.cart;
    if (cart.length > 0) {
        msg = "Items in your cart:";
        for (var i = 0; i < cart.length; i++) {
            msg += "\n* " + cart[i];
        }
    } else {
        msg = "Your cart is empty.";
    }
    session.endDialog(msg);
});

// Dialog for checking out
bot.dialog('checkoutDialog', function (session) {
    var msg;
    var cart = session.userData.cart;
    if (cart.length > 0) {
        msg = "Your order is on its way.";
    } else {
        msg = "Your cart is empty.";
    }
    delete session.userData.cart;
    if (session.userData.previousCart) {
        delete session.userData.previousCart;
    }
    session.endConversation(msg);
});

// Helper function to find a specific stack action
function findStackAction(routes, name) {
    for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        if (r.routeType === builder.Library.RouteTypes.StackAction &&
            r.routeData.action === name) {
                return r;
        }
    }
    return null;
}
if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());    
} else {
    module.exports = { default: connector.listen() }
}
