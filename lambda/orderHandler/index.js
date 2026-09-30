/**
 * AWS Lambda - orderHandler
 * Handles Order status lookups, Return submissions, and Refund queries.
 */

let ddbDocClient = null;
try {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
} catch (e) {
  console.log('AWS SDK not active, utilizing in-memory datastore');
}

const sampleOrders = {
  ORD1001: {
    orderId: 'ORD1001',
    userId: 'usr_101',
    productName: 'Wireless Bluetooth Headphones',
    orderDate: '2026-09-22T08:30:00.000Z',
    status: 'Shipped',
    expectedDelivery: '27 September 2026',
    carrier: 'FedEx',
    trackingNumber: 'TRK-893241-US',
    totalAmount: 79.99,
    refundStatus: 'Eligible'
  },
  ORD1002: {
    orderId: 'ORD1002',
    userId: 'usr_101',
    productName: 'USB-C Fast Charging Cable (Pack of 3)',
    orderDate: '2026-09-25T11:00:00.000Z',
    status: 'Processing',
    expectedDelivery: '30 September 2026',
    carrier: 'USPS',
    trackingNumber: 'Pending',
    totalAmount: 18.50,
    refundStatus: 'Eligible'
  },
  ORD1003: {
    orderId: 'ORD1003',
    userId: 'usr_102',
    productName: 'Smart Watch Pro Series 7',
    orderDate: '2026-09-18T16:45:00.000Z',
    status: 'Delivered',
    expectedDelivery: '22 September 2026',
    carrier: 'UPS',
    trackingNumber: 'TRK-441920-US',
    totalAmount: 199.99,
    refundStatus: 'Refund Processing (Return RET501)'
  },
  ORD1024: {
    orderId: 'ORD1024',
    userId: 'usr_101',
    productName: 'Gaming Mechanical Keyboard RGB',
    orderDate: '2026-09-24T14:15:00.000Z',
    status: 'Shipped',
    expectedDelivery: '28 September 2026',
    carrier: 'DHL Express',
    trackingNumber: 'TRK-992144-US',
    totalAmount: 129.00,
    refundStatus: 'Eligible for Return after delivery'
  },
  ORD1025: {
    orderId: 'ORD1025',
    userId: 'usr_103',
    productName: 'Laptop Stand Adjustable Ergonomic Aluminum',
    orderDate: '2026-09-25T18:00:00.000Z',
    status: 'Processing',
    expectedDelivery: '1 October 2026',
    carrier: 'USPS Priority',
    trackingNumber: 'Pending',
    totalAmount: 42.00,
    refundStatus: 'Eligible'
  }
};

const sampleReturns = [
  {
    returnId: 'RET501',
    orderId: 'ORD1003',
    reason: 'Battery drains quickly',
    status: 'Approved',
    refundAmount: 199.99,
    createdAt: '2026-09-23T10:15:00.000Z'
  }
];

const sampleProducts = [
  { productId: 'PRD001', name: 'Wireless Bluetooth Headphones', price: 79.99, inStock: true },
  { productId: 'PRD002', name: 'USB-C Fast Charging Cable (3-Pack)', price: 18.50, inStock: true },
  { productId: 'PRD003', name: 'Smart Watch Pro Series 7', price: 199.99, inStock: true },
  { productId: 'PRD004', name: 'Gaming Mechanical Keyboard RGB', price: 129.00, inStock: true },
  { productId: 'PRD005', name: 'Laptop Stand Adjustable Ergonomic', price: 42.00, inStock: true }
];

exports.handler = async (event) => {
  console.log('[orderHandler] Event:', JSON.stringify(event));

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST'
  };

  const method = event.httpMethod || 'GET';
  const path = event.path || '';
  const pathParams = event.pathParameters || {};

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'OK' }) };
  }

  try {
    // 1. GET /api/orders/{orderId}
    if (method === 'GET' && path.includes('/orders/')) {
      const orderId = (pathParams.orderId || path.split('/').pop() || '').toUpperCase();
      if (!orderId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Order ID parameter is required' })
        };
      }

      let order = null;
      if (ddbDocClient && process.env.DYNAMODB_TABLE_ORDERS) {
        const { GetCommand } = require('@aws-sdk/lib-dynamodb');
        const res = await ddbDocClient.send(new GetCommand({
          TableName: process.env.DYNAMODB_TABLE_ORDERS,
          Key: { orderId }
        }));
        order = res.Item;
      }
      if (!order) {
        order = sampleOrders[orderId];
      }

      if (!order) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Order #${orderId} was not found.` })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ order })
      };
    }

    // 2. POST /api/returns
    if (method === 'POST' && path.includes('/returns')) {
      const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
      const { orderId, reason, userId } = body;

      if (!orderId || !reason) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'orderId and reason are required to process a return.' })
        };
      }

      const normalizedOrderId = orderId.toUpperCase();
      const existingOrder = sampleOrders[normalizedOrderId];
      if (!existingOrder) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Cannot return invalid order #${normalizedOrderId}.` })
        };
      }

      const returnId = `RET${Math.floor(1000 + Math.random() * 9000)}`;
      const newReturn = {
        returnId,
        orderId: normalizedOrderId,
        userId: userId || existingOrder.userId,
        productName: existingOrder.productName,
        reason,
        status: 'Initiated',
        refundAmount: existingOrder.totalAmount,
        createdAt: new Date().toISOString()
      };

      if (ddbDocClient && process.env.DYNAMODB_TABLE_RETURNS) {
        const { PutCommand } = require('@aws-sdk/lib-dynamodb');
        await ddbDocClient.send(new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_RETURNS,
          Item: newReturn
        }));
      }
      sampleReturns.push(newReturn);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: 'Return request submitted successfully.',
          returnRequest: newReturn
        })
      };
    }

    // 3. GET /api/refunds/{orderId}
    if (method === 'GET' && path.includes('/refunds/')) {
      const orderId = (pathParams.orderId || path.split('/').pop() || '').toUpperCase();
      const order = sampleOrders[orderId];
      const returnRecord = sampleReturns.find(r => r.orderId === orderId);

      if (!order) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Order #${orderId} not found.` })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          orderId,
          productName: order.productName,
          totalAmount: order.totalAmount,
          refundStatus: order.refundStatus,
          activeReturn: returnRecord || null,
          policy: 'Standard 30-day money-back guarantee. Once item is received, refunds take 3-5 business days.'
        })
      };
    }

    // 4. GET /api/products
    if (method === 'GET' && path.includes('/products')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ products: sampleProducts })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Endpoint not found in orderHandler' })
    };
  } catch (error) {
    console.error('Error in orderHandler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error processing order request', details: error.message })
    };
  }
};
