const chatbotHandler = require('./lambda/chatbotHandler/index');
const orderHandler = require('./lambda/orderHandler/index');
const supportHandler = require('./lambda/supportHandler/index');

async function testAllLambdas() {
  console.log('🧪 Testing AWS Lambda Handlers...\n');

  // 1. ChatbotHandler with Lex event
  const lexGreetingEvent = {
    bot: { name: 'CustomerSupportBot' },
    sessionState: {
      intent: { name: 'Greeting', slots: {}, state: 'InProgress' }
    }
  };
  const lexGreetingRes = await chatbotHandler.handler(lexGreetingEvent);
  console.log('✅ chatbotHandler (Lex Greeting):', lexGreetingRes.messages[0].content.slice(0, 40));

  // 2. ChatbotHandler with Lex CheckOrderStatus event
  const lexOrderEvent = {
    bot: { name: 'CustomerSupportBot' },
    sessionState: {
      intent: {
        name: 'CheckOrderStatus',
        slots: { orderId: { value: { interpretedValue: 'ORD1024' } } }
      }
    }
  };
  const lexOrderRes = await chatbotHandler.handler(lexOrderEvent);
  console.log('✅ chatbotHandler (Lex Order):', lexOrderRes.messages[0].content.slice(0, 50));

  // 3. ChatbotHandler with API Gateway event
  const apigwEvent = {
    httpMethod: 'POST',
    path: '/api/chat',
    body: JSON.stringify({ message: 'Where is order ORD1001?' })
  };
  const apigwRes = await chatbotHandler.handler(apigwEvent);
  console.log('✅ chatbotHandler (API Gateway POST):', apigwRes.statusCode, JSON.parse(apigwRes.body).intent);

  // 4. OrderHandler GET order
  const orderRes = await orderHandler.handler({
    httpMethod: 'GET',
    path: '/api/orders/ORD1024',
    pathParameters: { orderId: 'ORD1024' }
  });
  console.log('✅ orderHandler (GET /orders/ORD1024):', orderRes.statusCode, JSON.parse(orderRes.body).order.productName);

  // 5. OrderHandler POST return
  const returnRes = await orderHandler.handler({
    httpMethod: 'POST',
    path: '/api/returns',
    body: JSON.stringify({ orderId: 'ORD1001', reason: 'Defective cable' })
  });
  console.log('✅ orderHandler (POST /returns):', returnRes.statusCode, JSON.parse(returnRes.body).returnRequest.returnId);

  // 6. SupportHandler POST support
  const supportRes = await supportHandler.handler({
    httpMethod: 'POST',
    path: '/api/support',
    body: JSON.stringify({ customerName: 'Ahmed', message: 'Urgent delivery escalation' })
  });
  console.log('✅ supportHandler (POST /support):', supportRes.statusCode, JSON.parse(supportRes.body).ticket.ticketId);

  console.log('\n🎉 ALL 3 LAMBDA FUNCTIONS EXECUTED SUCCESSFULLY!');
}

testAllLambdas().catch(console.error);
