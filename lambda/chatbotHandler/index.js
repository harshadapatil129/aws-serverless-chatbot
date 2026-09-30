/**
 * AWS Lambda - chatbotHandler
 * Handles Amazon Lex V2 Fulfillment CodeHooks and API Gateway POST /api/chat requests.
 */

// Dynamically use AWS SDK if configured, fallback to built-in handlers
let ddbDocClient = null;
try {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
  const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
} catch (e) {
  console.log('AWS SDK not loaded in local environment, using fallback handlers');
}

// In-memory fallback dataset if DynamoDB is unavailable or running locally
const sampleOrders = {
  ORD1001: {
    orderId: 'ORD1001',
    productName: 'Wireless Bluetooth Headphones',
    status: 'Shipped',
    expectedDelivery: '27 September 2026',
    carrier: 'FedEx',
    trackingNumber: 'TRK-893241-US',
    totalAmount: 79.99,
    refundStatus: 'Eligible'
  },
  ORD1002: {
    orderId: 'ORD1002',
    productName: 'USB-C Fast Charging Cable (Pack of 3)',
    status: 'Processing',
    expectedDelivery: '30 September 2026',
    carrier: 'USPS',
    trackingNumber: 'Pending',
    totalAmount: 18.50,
    refundStatus: 'Eligible'
  },
  ORD1003: {
    orderId: 'ORD1003',
    productName: 'Smart Watch Pro Series 7',
    status: 'Delivered',
    expectedDelivery: '22 September 2026',
    carrier: 'UPS',
    trackingNumber: 'TRK-441920-US',
    totalAmount: 199.99,
    refundStatus: 'Refund Processing (Return RET501)'
  },
  ORD1024: {
    orderId: 'ORD1024',
    productName: 'Gaming Mechanical Keyboard RGB',
    status: 'Shipped',
    expectedDelivery: '28 September 2026',
    carrier: 'DHL Express',
    trackingNumber: 'TRK-992144-US',
    totalAmount: 129.00,
    refundStatus: 'Eligible for Return after delivery'
  },
  ORD1025: {
    orderId: 'ORD1025',
    productName: 'Laptop Stand Adjustable Ergonomic Aluminum',
    status: 'Processing',
    expectedDelivery: '1 October 2026',
    carrier: 'USPS Priority',
    trackingNumber: 'Pending',
    totalAmount: 42.00,
    refundStatus: 'Eligible'
  }
};

/**
 * Fetch order from DynamoDB or fallback
 */
async function getOrder(orderId) {
  const normalizedId = (orderId || '').trim().toUpperCase();
  if (ddbDocClient && process.env.DYNAMODB_TABLE_ORDERS) {
    try {
      const { GetCommand } = require('@aws-sdk/lib-dynamodb');
      const response = await ddbDocClient.send(new GetCommand({
        TableName: process.env.DYNAMODB_TABLE_ORDERS,
        Key: { orderId: normalizedId }
      }));
      if (response.Item) return response.Item;
    } catch (err) {
      console.warn('DynamoDB query failed, checking fallback:', err.message);
    }
  }
  return sampleOrders[normalizedId] || null;
}

/**
 * Store support ticket
 */
async function createSupportTicket(ticket) {
  if (ddbDocClient && process.env.DYNAMODB_TABLE_SUPPORT_TICKETS) {
    try {
      const { PutCommand } = require('@aws-sdk/lib-dynamodb');
      await ddbDocClient.send(new PutCommand({
        TableName: process.env.DYNAMODB_TABLE_SUPPORT_TICKETS,
        Item: ticket
      }));
      console.log('Saved ticket to DynamoDB:', ticket.ticketId);
    } catch (err) {
      console.warn('Failed saving ticket to DynamoDB:', err.message);
    }
  }
  return ticket;
}

/**
 * Handle Amazon Lex V2 Fulfillment Hook
 */
async function handleLexEvent(event) {
  const intentName = event.sessionState?.intent?.name || 'FallbackIntent';
  const slots = event.sessionState?.intent?.slots || {};
  console.log(`[Lex] Received intent: ${intentName}`);

  let responseMessage = '';
  let slotToElicit = null;

  switch (intentName) {
    case 'Greeting':
      responseMessage = '👋 Hello! Welcome to Customer Support. I can help you check order status, track shipments, request returns, or connect with a human agent. How can I assist you today?';
      break;

    case 'CheckOrderStatus':
    case 'TrackOrder': {
      const rawOrderId = slots.orderId?.value?.interpretedValue || slots.orderId?.value?.originalValue;
      if (!rawOrderId) {
        slotToElicit = 'orderId';
        responseMessage = 'Please provide your order ID (e.g., ORD1001, ORD1024) so I can check the current status.';
      } else {
        const order = await getOrder(rawOrderId);
        if (order) {
          responseMessage = `📦 Order #${order.orderId} (${order.productName}) is currently ${order.status}. Expected delivery: ${order.expectedDelivery}. Carrier: ${order.carrier} (Tracking: ${order.trackingNumber}).`;
        } else {
          responseMessage = `I could not find order "${rawOrderId.toUpperCase()}". Please verify your order number and try again, or ask to speak with an agent.`;
        }
      }
      break;
    }

    case 'ReturnProduct': {
      const rawOrderId = slots.orderId?.value?.interpretedValue || slots.orderId?.value?.originalValue;
      const rawReason = slots.returnReason?.value?.interpretedValue || slots.returnReason?.value?.originalValue;

      if (!rawOrderId) {
        slotToElicit = 'orderId';
        responseMessage = 'Sure! I can help you process a return. Please provide your order ID.';
      } else if (!rawReason) {
        slotToElicit = 'returnReason';
        responseMessage = `Thank you. For order ${rawOrderId.toUpperCase()}, what is the reason for your return? (e.g., Defective, Wrong item, Changed mind)`;
      } else {
        const returnId = `RET${Math.floor(1000 + Math.random() * 9000)}`;
        responseMessage = `✅ Return request #${returnId} has been created for order ${rawOrderId.toUpperCase()} (Reason: "${rawReason}"). A prepaid shipping label has been sent to your registered email address.`;
      }
      break;
    }

    case 'RefundStatus': {
      const rawOrderId = slots.orderId?.value?.interpretedValue || slots.orderId?.value?.originalValue;
      if (rawOrderId) {
        const order = await getOrder(rawOrderId);
        if (order) {
          responseMessage = `💰 Refund status for Order #${order.orderId}: ${order.refundStatus}. Standard refunds take 3-5 business days to appear on your original payment method.`;
        } else {
          responseMessage = `Our refund policy offers a 30-day money-back guarantee for unused items. Refunds are processed within 3-5 business days once returned items are received.`;
        }
      } else {
        responseMessage = 'Our standard policy offers a 30-day money-back guarantee from the delivery date. Once your return is received and inspected, refunds are credited back to your original payment method within 3 to 5 business days.';
      }
      break;
    }

    case 'ProductInformation':
      responseMessage = 'We offer high quality consumer electronics including Wireless Bluetooth Headphones ($79.99), USB-C Fast Charging Cables ($18.50), Smart Watch Pro Series 7 ($199.99), and RGB Gaming Mechanical Keyboards ($129.00). All items come with a 1-year warranty!';
      break;

    case 'ContactSupport': {
      const ticketId = `TKT${Math.floor(1000 + Math.random() * 9000)}`;
      await createSupportTicket({
        ticketId,
        subject: 'Human Agent Request',
        status: 'Open',
        priority: 'High',
        estimatedResponse: 'Within 2 hours',
        createdAt: new Date().toISOString()
      });
      responseMessage = `🎫 Support ticket #${ticketId} has been created for you! A customer care specialist has been notified and will contact you via email within 2 hours.`;
      break;
    }

    case 'BusinessHours':
      responseMessage = '⏰ Our customer support team is available Monday through Friday from 9:00 AM to 6:00 PM EST. However, our serverless AI chatbot is available 24/7/365!';
      break;

    case 'Goodbye':
      responseMessage = 'Thank you for reaching out to Customer Support. Have a wonderful day!';
      break;

    default:
      responseMessage = "I'm sorry, I didn't quite catch that. You can ask about order status (e.g., 'Where is order ORD1024?'), product returns, refund policies, or ask to 'talk to an agent'.";
      break;
  }

  // Build Lex V2 response structure
  if (slotToElicit) {
    return {
      sessionState: {
        dialogAction: {
          type: 'ElicitSlot',
          slotToElicit
        },
        intent: {
          name: intentName,
          slots,
          state: 'InProgress'
        }
      },
      messages: [
        {
          contentType: 'PlainText',
          content: responseMessage
        }
      ]
    };
  }

  return {
    sessionState: {
      dialogAction: {
        type: 'Close'
      },
      intent: {
        name: intentName,
        slots,
        state: 'Fulfilled'
      }
    },
    messages: [
      {
        contentType: 'PlainText',
        content: responseMessage
      }
    ]
  };
}

/**
 * Handle API Gateway REST invocation (POST /api/chat)
 */
async function handleApiGatewayEvent(event) {
  console.log('[API Gateway] Path:', event.path, 'Method:', event.httpMethod);

  // Enable CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'OK' }) };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const message = (body.message || '').trim();
    const userId = body.userId || 'guest_user';

    if (!message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message cannot be empty.' })
      };
    }

    // In a full AWS setup, this would call Lex Runtime V2 recognizeText.
    // Here we can detect intents directly or format response
    const upperMsg = message.toUpperCase();
    let reply = '';
    let intent = 'General';
    let orderData = null;
    let ticketId = null;

    // Check for Order ID pattern
    const orderMatch = upperMsg.match(/ORD\d{4,}/);

    if (/\b(HI|HELLO|HEY|GREETINGS)\b/i.test(message)) {
      intent = 'Greeting';
      reply = '👋 Hello! Welcome to Customer Support! I can help you check your order status, process returns, explain refund policies, or connect you with a human agent.';
    } else if (orderMatch && (upperMsg.includes('WHERE') || upperMsg.includes('STATUS') || upperMsg.includes('TRACK') || upperMsg.startsWith('ORD'))) {
      intent = 'CheckOrderStatus';
      const order = await getOrder(orderMatch[0]);
      if (order) {
        orderData = order;
        reply = `📦 Order #${order.orderId} (${order.productName}) is currently ${order.status}. Expected delivery: ${order.expectedDelivery}. Carrier: ${order.carrier} (${order.trackingNumber}).`;
      } else {
        reply = `❌ Sorry, we could not find any order with ID "${orderMatch[0]}". Please check the number and try again.`;
      }
    } else if (upperMsg.includes('WHERE IS MY ORDER') || upperMsg.includes('TRACK MY ORDER') || upperMsg.includes('ORDER STATUS')) {
      intent = 'CheckOrderStatus';
      reply = 'Please provide your order ID (e.g., ORD1001, ORD1024) so I can look up the latest shipping status.';
    } else if (upperMsg.includes('RETURN') || upperMsg.includes('EXCHANGE')) {
      intent = 'ReturnProduct';
      if (orderMatch) {
        const returnId = `RET${Math.floor(1000 + Math.random() * 9000)}`;
        reply = `✅ Return #${returnId} has been initiated for Order ${orderMatch[0]}. We have emailed return instructions and a prepaid return shipping label.`;
      } else {
        reply = 'I can help guide you through the return process. Please provide your Order ID (e.g. ORD1001) to begin.';
      }
    } else if (upperMsg.includes('REFUND')) {
      intent = 'RefundStatus';
      reply = '💰 Our refund policy allows returns within 30 days of delivery. Refunds are processed within 3-5 business days of inspection back to your original payment method.';
    } else if (upperMsg.includes('AGENT') || upperMsg.includes('HUMAN') || upperMsg.includes('TALK TO') || upperMsg.includes('REPRESENTATIVE')) {
      intent = 'ContactSupport';
      ticketId = `TKT${Math.floor(1000 + Math.random() * 9000)}`;
      await createSupportTicket({
        ticketId,
        userId,
        subject: 'Human Support Escalation',
        status: 'Open',
        priority: 'High',
        estimatedResponse: 'Within 2 hours',
        createdAt: new Date().toISOString()
      });
      reply = `🎫 Support ticket #${ticketId} has been created. A support specialist has been assigned and will contact you within 2 hours.`;
    } else if (upperMsg.includes('HOURS') || upperMsg.includes('OPEN') || upperMsg.includes('SCHEDULE')) {
      intent = 'BusinessHours';
      reply = '⏰ Our customer support office is open Monday through Friday, 9:00 AM to 6:00 PM EST. Our automated assistant is available 24/7.';
    } else if (upperMsg.includes('PRODUCT') || upperMsg.includes('CATALOG') || upperMsg.includes('SELL')) {
      intent = 'ProductInformation';
      reply = 'We specialize in electronics: Wireless Headphones ($79.99), USB-C Cables ($18.50), Smart Watch Pro ($199.99), and RGB Mechanical Keyboards ($129.00).';
    } else if (/\b(BYE|GOODBYE|THANKS|THANK YOU)\b/i.test(message)) {
      intent = 'Goodbye';
      reply = 'Thank you for contacting customer support. Have a great day ahead!';
    } else {
      intent = 'FallbackIntent';
      reply = "I'm not sure I understood that. You can ask me to track an order (e.g. 'Where is order ORD1024?'), initiate a return, check our refund policy, or type 'talk to an agent'.";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: reply,
        intent,
        order: orderData,
        ticketId,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error in handleApiGatewayEvent:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error processing chatbot request',
        details: error.message
      })
    };
  }
}

/**
 * Main Lambda Handler Entry Point
 */
exports.handler = async (event) => {
  console.log('Incoming Lambda Event:', JSON.stringify(event, null, 2));

  // Determine if called by Lex V2 or API Gateway
  if (event.sessionState && event.bot) {
    return await handleLexEvent(event);
  } else if (event.httpMethod || event.path) {
    return await handleApiGatewayEvent(event);
  }

  // Direct invoke fallback
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Lambda chatbotHandler executed successfully' })
  };
};
