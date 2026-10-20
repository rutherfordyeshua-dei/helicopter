# Rotor Command — plan de implementación

## Alcance

Simulador 3D de vuelo de helicóptero, sencillo pero pulido, en español y optimizado para teclado de Windows. El bucle principal es despegar desde una base, volar por el valle, atravesar tres waypoints y volver a aterrizar en la plataforma. El jugador conserva libertad de exploración y puede activar auto-hover para estabilizarse.

## Implementación

- Mantener el starter Three.js/Vite, el renderer, el loop fijo, el guardado y el sistema Tweak existente.
- Reemplazar la escena de islas/plataformas por un valle procedural con agua, terreno, árboles, helipuerto, balizas y cielo.
- Reemplazar el controlador de personaje por un modelo de vuelo arcade: posición, velocidad, cabeceo, alabeo, guiñada, colectivo, combustible y RPM; suavizado para que resulte fácil de controlar.
- Construir el helicóptero con geometría Three.js ligera: fuselaje, cabina, brazos, rotor principal animado, rotor de cola y luces.
- Incorporar cámara tercera persona y cámara de cabina, cambiables con C; HUD HTML con altitud, velocidad, rumbo, combustible, RPM, waypoint actual, auto-hover y mensajes de misión.
- Adaptar la entrada para W/S cabeceo, A/D alabeo, Q/E guiñada, Shift/Ctrl colectivo, Space auto-hover, C cámara, Esc pausa y R reinicio. Mantener gamepad/touch funcionales como degradación razonable.
- Usar una misión compacta de tres waypoints con progreso visible y final al regresar a la plataforma a baja velocidad y altitud.

## Diseño

Se evaluaron tres estilos: **cabina militar nocturna** (0.06), **rescate alpino cinematográfico** (0.08) y **simulador técnico de amanecer** (0.07). Se elige **simulador técnico de amanecer**.

- **Movimiento:** HUD aeronáutico limpio sobre un paisaje de amanecer con lectura tipo aviónica.
- **Principios:** control inmediato, contraste fuerte, profundidad atmosférica y feedback constante.
- **Color:** azul petróleo y verde valle para el mundo; ámbar para instrumentos, cian para waypoints y rojo reservado a alertas.
- **Layout:** horizonte abierto con instrumentos anclados a esquinas y una banda inferior de estado, evitando cubrir el centro de vuelo.
- **Firma visual:** retícula de objetivo, líneas de rumbo finas y balizas cian pulsantes en cada waypoint.
- **Interacción:** cada control debe reflejarse en la inclinación del helicóptero, el rotor y el HUD; auto-hover reduce gradualmente la deriva en lugar de bloquear el vuelo.
- **Animación:** rotores con velocidad proporcional a RPM, balizas pulsantes, nubes lentas y transiciones suaves de cámara/HUD.
- **Tipografía:** ManusCC0 para titulares y valores; interfaz compacta sans para etiquetas.
- **Esencia:** un vuelo arcade legible que hace sentir al jugador dentro de una cabina sin exigir conocimientos de aviación. Personalidad: táctica, accesible, atmosférica.
- **Voz:** órdenes breves y funcionales, por ejemplo “DESPEGUE AUTORIZADO” y “REGRESA A LA BASE PARA COMPLETAR LA ENTREGA”.
- **Marca:** wordmark ROTOR COMMAND junto a una silueta angular de rotor y una retícula de navegación.
- **Color propio:** ámbar de instrumento #ffc857.

## Estructura

- `src/game/game.ts`: estado de vuelo, misión, cámaras y render de escena.
- `src/game/world.ts`: valle procedural, agua, base, waypoints, árboles, luces y fondo.
- `src/game/player.ts`: helicóptero procedural, animación de rotores y pose de vuelo.
- `src/game/camera.ts`: tercera persona y cámara de cabina.
- `src/game/config.ts`: parámetros de vuelo, misión y cámara.
- `src/engine/input.ts`: mapa de controles Windows y acciones discretas.
- `src/ui/ui.ts`, `src/styles/main.css`: menú, HUD, pausa, resultados y presentación.
- `src/i18n/*.json`: textos del juego; el contenido expuesto se fija en español.
