import type { APIRoute } from 'astro';

export const prerender = false; // Para que se ejecute en el servidor bajo demanda

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPTS = {
  agenda: `Eres un asistente virtual de IA para una barbería/peluquería llamada "MicroBarber".
Tu trabajo es atender al cliente de forma profesional, seria y muy directa.
REGLA MUY IMPORTANTE: NO uses emojis. NO uses formato markdown (nada de asteriscos para negritas, ni guiones para listas). Escribe en texto plano usando párrafos cortos separados por un salto de línea.
Puedes dar información sobre:
- Horarios: lunes a sábados de 10:00 a 20:00.
- Trabajadores: Álex (especialista en degradados) y Laura (especialista en color y cortes clásicos).
- Precios: Corte clásico 15 euros, Degradado 18 euros, Arreglo de barba 10 euros.
Tu objetivo es ayudarles a agendar una cita. Pregunta siempre qué día, a qué hora y con quién quieren el servicio.
Cuando el cliente confirme los datos, usa SIEMPRE la herramienta 'book_appointment' para agendarla en el calendario visual.
Si el cliente quiere cancelar una cita, pídele la hora y usa la herramienta 'cancel_appointment'.
Sé conciso y eficiente.`,

  menu: `Eres un asistente virtual de IA para un restaurante premium llamado "El Botquerón Dorado".
Tu trabajo es atender a los clientes explicándoles la carta con un tono profesional, elegante y cálido.
REGLA MUY IMPORTANTE: NO uses emojis. NO uses formato markdown (nada de asteriscos para negritas, ni guiones para listas). Escribe en texto plano usando párrafos cortos separados por un salto de línea.
La carta incluye:
- Entrantes: Ensaladilla malagueña (8 euros), Porra antequerana (7 euros), Fritura de pescado (15 euros).
- Principales: Espetos de sardinas (6 euros/ud), Paella de marisco (18 euros/pax), Chuletón madurado (25 euros).
- Postres: Tarta de queso fluida (6 euros), Flan de huevo casero (5 euros).
- Alérgenos: La fritura lleva gluten. La tarta de queso lleva lácteos.
Cuando el cliente quiera pedir algo, usa SIEMPRE la herramienta 'add_to_order' para añadirlo a la comanda. 
Si quiere quitar algo, usa 'remove_from_order'.
Recomienda platos y responde dudas sobre la carta. Sé muy amable pero mantén la formalidad.`
};

const TOOLS = {
  agenda: [
    {
      type: "function",
      function: {
        name: "book_appointment",
        description: "Agenda una cita en el calendario.",
        parameters: {
          type: "object",
          properties: {
            time: { type: "string", description: "Hora de la cita en formato HH:00 (ej. 12:00, 16:00). El horario es de 10:00 a 19:00." },
            customer_name: { type: "string", description: "Nombre del cliente." },
            service: { type: "string", description: "Servicio solicitado." },
            staff: { type: "string", description: "Nombre del trabajador (Álex o Laura)." }
          },
          required: ["time", "customer_name", "service", "staff"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "cancel_appointment",
        description: "Cancela una cita del calendario.",
        parameters: {
          type: "object",
          properties: {
            time: { type: "string", description: "Hora de la cita a cancelar en formato HH:00." }
          },
          required: ["time"]
        }
      }
    }
  ],
  menu: [
    {
      type: "function",
      function: {
        name: "add_to_order",
        description: "Añade un plato al pedido actual.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "Nombre exacto del plato." },
            quantity: { type: "number", description: "Cantidad a pedir." },
            price: { type: "number", description: "Precio total de esta cantidad (ej. si pide 2 paellas de 18€, es 36)." }
          },
          required: ["item_name", "quantity", "price"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "remove_from_order",
        description: "Elimina un plato del pedido actual.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "Nombre del plato a eliminar." }
          },
          required: ["item_name"]
        }
      }
    }
  ]
};

export const POST: APIRoute = async ({ request }) => {
  // 1. Obtener la clave de entorno (se lee en tiempo de ejecución, nunca queda grabada en el bundle)
  const apiKey = OPENROUTER_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Falta configurar la clave OPENROUTER_API_KEY en el .env.' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { messages, demoType, context } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Formato inválido en los mensajes.' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Preparar el System Prompt
    let finalSystemPrompt = SYSTEM_PROMPTS?.[demoType] || '';
    if (context) {
      finalSystemPrompt += `\n\nCONTEXTO ACTUALIZADO POR EL USUARIO (Usa esta información prioritariamente):\n${context}`;
    }

    // 3. Insertar/Actualizar el system prompt al inicio
    let finalMessages = [...messages];
    if (finalMessages.length === 0 || finalMessages[0].role !== 'system') {
      finalMessages.unshift({ role: 'system', content: finalSystemPrompt });
    } else {
      finalMessages[0] = { ...finalMessages[0], content: finalSystemPrompt };
    }

    // 4. Armar el payload evitando enviar tools vacías
    const activeTools = TOOLS?.[demoType];
    const hasTools = Array.isArray(activeTools) && activeTools.length > 0;

    const payload: Record<string, any> = {
      model: "openrouter/free",
      messages: finalMessages,
    };

    if (hasTools) {
      payload.tools = activeTools;
      payload.tool_choice = "auto";
    }

    // 5. Petición a OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:4321', // Requerido/Recomendado por OpenRouter para analíticas
        'X-Title': 'Astro App'
      },
      body: JSON.stringify(payload),
    });

    // 6. Control detallado de errores HTTP de la API
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error de OpenRouter:', errorData);
      return new Response(
        JSON.stringify({ 
          error: errorData?.error?.message || 'Error en la respuesta de la IA.' 
        }), 
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    return new Response(
      JSON.stringify({ 
        reply: message?.content ?? '', 
        tool_calls: message?.tool_calls ?? [] 
      }), 
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('API Internal Error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno en el servidor.' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

