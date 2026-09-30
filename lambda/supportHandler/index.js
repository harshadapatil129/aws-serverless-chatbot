/**
 * AWS Lambda - supportHandler
 * Handles Customer Support escalation and ticket tracking.
 */

let ddbDocClient = null;
try {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
  const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
  ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
} catch (e) {
  console.log('AWS SDK not active, utilizing in-memory datastore');
}

const sampleTickets = {
  TKT1025: {
    ticketId: 'TKT1025',
    userId: 'usr_101',
    customerName: 'Ahmed Khan',
    subject: 'Expedited delivery request for ORD1024',
    message: 'Customer requested urgent dispatch confirmation from human agent.',
    status: 'Open',
    priority: 'Medium',
    estimatedResponse: 'Within 2 hours',
    createdAt: '2026-09-26T20:30:00.000Z'
  }
};

exports.handler = async (event) => {
  console.log('[supportHandler] Event:', JSON.stringify(event));

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
    // 1. POST /api/support (Create new ticket)
    if (method === 'POST') {
      const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
      const { userId, customerName, subject, message } = body;

      const ticketId = `TKT${Math.floor(1000 + Math.random() * 9000)}`;
      const newTicket = {
        ticketId,
        userId: userId || 'anonymous_user',
        customerName: customerName || 'Customer',
        subject: subject || 'Human Agent Escalation',
        message: message || 'Customer requested live support.',
        status: 'Open',
        priority: 'High',
        estimatedResponse: 'Within 2 hours',
        createdAt: new Date().toISOString()
      };

      if (ddbDocClient && process.env.DYNAMODB_TABLE_SUPPORT_TICKETS) {
        const { PutCommand } = require('@aws-sdk/lib-dynamodb');
        await ddbDocClient.send(new PutCommand({
          TableName: process.env.DYNAMODB_TABLE_SUPPORT_TICKETS,
          Item: newTicket
        }));
      }
      sampleTickets[ticketId] = newTicket;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          message: `Support ticket #${ticketId} created successfully.`,
          ticket: newTicket
        })
      };
    }

    // 2. GET /api/support/{ticketId}
    if (method === 'GET') {
      const ticketId = (pathParams.ticketId || path.split('/').pop() || '').toUpperCase();
      let ticket = null;

      if (ddbDocClient && process.env.DYNAMODB_TABLE_SUPPORT_TICKETS) {
        const { GetCommand } = require('@aws-sdk/lib-dynamodb');
        const res = await ddbDocClient.send(new GetCommand({
          TableName: process.env.DYNAMODB_TABLE_SUPPORT_TICKETS,
          Key: { ticketId }
        }));
        ticket = res.Item;
      }

      if (!ticket) {
        ticket = sampleTickets[ticketId];
      }

      if (!ticket) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Support ticket #${ticketId} not found.` })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ticket })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Endpoint not found in supportHandler' })
    };
  } catch (error) {
    console.error('Error in supportHandler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error in supportHandler', details: error.message })
    };
  }
};
