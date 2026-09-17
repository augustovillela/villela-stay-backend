// Traduções EN/ES dos artigos do blog, por slug.
// O PT vem de content/blog/<slug>.js; aqui ficam as versões traduzidas (fallback por campo para PT).
// Estrutura por slug: { en: { titulo, descricao, h1, dek, casasTitulo, casasTexto,
//   isca:{titulo,texto,botao}, faq:[{q,a}], corpo:(h)=>HTML }, es: { ... } }
// Os helpers de corpo (h.fig, h.casaLink, h.wa, h.esc) são os mesmos do build (renderArtigo).

module.exports = {
  arquitetura: {
    en: {
      titulo: 'Brasília Architecture: a guide to seeing the city with new eyes | Villela Stay',
      descricao: "Niemeyer, Lúcio Costa, Burle Marx and Athos Bulcão: the guide to Brasília's modernist architecture — what to see, why it matters and where to stay inside the story.",
      h1: "Brasília wasn't built. It was designed.",
      dek: 'In a thousand days, in the middle of the cerrado, the greatest work of urban art of the 20th century was born. This is the guide to understanding — and living — the architecture that made an entire city a World Heritage Site.',
      casasTitulo: 'Sleep inside the architecture you came to admire',
      casasTexto: "Our houses in Lago Sul belong to the same aesthetic family you see on the Esplanada: clean lines, integration with the garden, light and concrete. It's not a hotel — it's living, for a few days, in the Brasília the world came to see.",
      isca: { titulo: "One-Day Modernist Itinerary (host's PDF)", texto: "The right order to see Niemeyer's works without wasting time in traffic — with the best light for photographing each one. Download now.", botao: 'I want the itinerary' },
      faq: [
        { q: 'Why is Brasília a World Heritage Site?', a: "UNESCO inscribed Brasília on the list in 1987 — it was the first 20th-century city to receive the title. The recognition is for Lúcio Costa's Pilot Plan urban design and Oscar Niemeyer's architecture, a unique and intact example of the principles of modern urbanism applied to an entire capital, from scratch." },
        { q: 'Which Niemeyer works can you see in a day?', a: 'The Metropolitan Cathedral, the National Congress, the Praça dos Três Poderes (with the Planalto Palace and the Supreme Court), the Itamaraty Palace and, in the late afternoon, the Ermida Dom Bosco for the sunset over the lake. All a few minutes apart along the Monumental Axis.' },
        { q: 'Can you visit the palaces inside?', a: 'Yes, some. The Planalto Palace and the Itamaraty open for free guided tours on specific days and times (usually by appointment). The National Congress also welcomes visitors. Check the official schedules before you go — they change with the institutional calendar.' },
        { q: "What's the best time to photograph the architecture?", a: 'The dry season (May to September) gives the cleanest, deepest blue sky in Brazil — the perfect contrast for Niemeyer\'s white concrete. For the light, early morning and late afternoon (the "golden hour") are unbeatable, especially at the Cathedral and the Ermida Dom Bosco.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Some cities grow. Brasília was <strong>conceived</strong> — every axis, every palace, every curve of concrete came off a drawing board before it existed in the cerrado. When you walk along the Esplanada dos Ministérios, you're not in a historic centre that piled up over centuries: you're inside an idea, built whole, in three years and ten months. That's why looking at Brasília slowly changes the one who looks.</p>

${h.fig(1, { legenda: "Niemeyer's white concrete against the dry sky of the Central Plateau." })}

<h2>The four names you need to know</h2>
<p>Brasília is a collective work, but four names explain almost all of it — and, not by chance, they are the same ones that give their names to the Villela Stay houses.</p>

<h3>Lúcio Costa — the man who drew the city</h3>
<p>In 1957, Lúcio Costa won the Pilot Plan competition with an almost simple gesture: two crossing axes, like making the sign of the cross or opening your arms to take possession of a place. From that line came the Monumental Axis and the Road Axis, the superblocks, the monumental scale of power and the human scale of those who live there. Costa didn't design buildings — he designed <em>how people live</em>. Understanding Brasília starts with understanding that everything there has intention.</p>

<h3>Oscar Niemeyer — the curve that became a symbol</h3>
<p>If Lúcio Costa gave the logic, Niemeyer gave the poetry. "It is not the right angle that attracts me, nor the straight line, hard and inflexible. What attracts me is the free, sensual curve," he wrote. His curves are in the Cathedral that looks like hands raised to the sky, in the columns of the Alvorada, in the dome and bowl of the Congress. Niemeyer proved that reinforced concrete could be light, lyrical, Brazilian. He designed the capital's main monuments — and went on creating until he died, at 104.</p>

${h.fig(2, { legenda: 'The 16 columns of the Metropolitan Cathedral, rising like hands in prayer.' })}

<h3>Roberto Burle Marx — the garden as a work of art</h3>
<p>The Brasília you see is not only concrete and sky: it is also designed greenery. Burle Marx treated landscaping as painting — masses of tropical plants composing organic shapes that converse with the architecture. He taught the world to see Brazilian flora as heritage, not weeds. The Itamaraty gardens are one of his masterpieces. <a href="${h.L('/blog/paisagismo.html')}">We dedicate the whole landscaping guide to him →</a></p>

<h3>Athos Bulcão — the art that covers the city</h3>
<p>Look at the walls. The blue-and-white tiles of the little Nossa Senhora de Fátima church, the airport panels, the reliefs spread across dozens of buildings: they are by Athos Bulcão, the artist who dressed Brasília. His work with modular patterns — repetition with variation, never identical — is proof that Brazilian modernism had warmth, colour and an artist's hand.</p>

<h2>The essential architecture itinerary</h2>
<p>If you have one day, do it in this order — it's how the light and the traffic help:</p>
<ul class="artigo-lista">
  <li><strong>Morning — Praça dos Três Poderes.</strong> The symbolic heart of the Republic: the Planalto, the Supreme Court and the Congress around a square that is itself an open-air museum. Start early, before the harsh sun.</li>
  <li><strong>Mid-morning — Metropolitan Cathedral.</strong> Outside, the 16 hyperboloid columns; inside, the light pouring through Marianne Peretti's stained glass and Alfredo Ceschiatti's suspended angels. It may be the most beautiful thing in the city.</li>
  <li><strong>Lunch — Itamaraty or Asa Sul.</strong> The Itamaraty Palace, with its arches over the reflecting pool and Burle Marx's gardens, is a must. <a href="${h.L('/blog/gastronomia.html')}">Where to eat is in the food guide →</a></li>
  <li><strong>Afternoon — Memorial JK and the Monumental Axis.</strong> Juscelino's mausoleum, with the statue beneath the stylised sickle, closes the meaning of it all: here rests the man who had the courage to build this.</li>
  <li><strong>Sunset — Ermida Dom Bosco.</strong> A small Niemeyer chapel (1957) overlooking Lake Paranoá. The best late afternoon in Brasília, and 10 minutes from our houses.</li>
</ul>

${h.fig(3, { legenda: 'The National Congress: the dome, the bowl and the twin towers on the axis of the Esplanada.' })}

<h2>Why this matters for your trip</h2>
<p>Because Brasília does not give itself up to those who rush past. It reveals itself to those who know what they're seeing — and to those who stay close enough to return to the Cathedral at dusk, or catch the Ermida at the right moment. It was with that gaze that Villela Stay was born: houses in Lago Sul that belong to the same aesthetic lineage as the city — integrated with the garden, open to the light, without excess. You don't visit Brasília's architecture. You wake up inside it.</p>
`,
    },
    es: {
      titulo: 'Arquitectura de Brasília: la guía para ver la ciudad con otros ojos | Villela Stay',
      descricao: 'Niemeyer, Lúcio Costa, Burle Marx y Athos Bulcão: la guía de la arquitectura modernista de Brasília — qué ver, por qué importa y dónde alojarse dentro de esa historia.',
      h1: 'Brasília no se construyó. Se diseñó.',
      dek: 'En mil días, en medio del cerrado, nació la mayor obra de arte urbana del siglo XX. Esta es la guía para entender — y vivir — la arquitectura que convirtió a una ciudad entera en Patrimonio de la Humanidad.',
      casasTitulo: 'Duerme dentro de la arquitectura que viniste a admirar',
      casasTexto: 'Nuestras casas en el Lago Sul son de la misma familia estética que ves en la Esplanada: líneas limpias, integración con el jardín, luz y hormigón. No es un hotel — es vivir, por unos días, en la Brasília que el mundo vino a conocer.',
      isca: { titulo: 'Itinerario Modernista de 1 día (PDF del anfitrión)', texto: 'El orden correcto para ver las obras de Niemeyer sin perder tiempo en el tráfico — con la mejor luz para fotografiar cada una. Descárgalo ahora.', botao: 'Quiero el itinerario' },
      faq: [
        { q: '¿Por qué Brasília es Patrimonio de la Humanidad?', a: 'La UNESCO inscribió a Brasília en la lista en 1987 — fue la primera ciudad del siglo XX en recibir el título. El reconocimiento es por el conjunto urbanístico del Plan Piloto de Lúcio Costa y por la arquitectura de Oscar Niemeyer, un ejemplo único e íntegro de los principios del urbanismo moderno aplicados a una capital entera, desde cero.' },
        { q: '¿Qué obras de Niemeyer ver en un día?', a: 'La Catedral Metropolitana, el Congreso Nacional, la Praça dos Três Poderes (con el Palacio del Planalto y el Supremo Tribunal), el Palacio de Itamaraty y, al atardecer, la Ermida Dom Bosco para la puesta de sol sobre el lago. Todas a pocos minutos unas de otras por el Eje Monumental.' },
        { q: '¿Se pueden visitar los palacios por dentro?', a: 'Sí, algunos. El Palacio del Planalto y el de Itamaraty abren para visitas guiadas gratuitas en días y horarios específicos (normalmente con reserva). El Congreso Nacional también recibe visitas. Confirma las agendas oficiales antes de ir — cambian según la agenda institucional.' },
        { q: '¿Cuál es la mejor época para fotografiar la arquitectura?', a: 'La estación seca (mayo a septiembre) da el cielo azul más limpio y profundo de Brasil — el contraste perfecto para el hormigón blanco de Niemeyer. Para la luz, el inicio de la mañana y el final de la tarde (la "hora dorada") son imbatibles, sobre todo en la Catedral y en la Ermida Dom Bosco.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Hay ciudades que crecen. Brasília fue <strong>pensada</strong> — cada eje, cada palacio, cada curva de hormigón salió de un tablero antes de existir en el cerrado. Cuando caminas por la Esplanada dos Ministérios, no estás en un centro histórico que se acumuló durante siglos: estás dentro de una idea, ejecutada entera, en tres años y diez meses. Por eso mirar Brasília con calma cambia a quien mira.</p>

${h.fig(1, { legenda: 'El hormigón blanco de Niemeyer contra el cielo seco del Planalto Central.' })}

<h2>Los cuatro nombres que necesitas conocer</h2>
<p>Brasília es obra colectiva, pero cuatro nombres la explican casi entera — y, no por casualidad, son los mismos que dan nombre a las casas de Villela Stay.</p>

<h3>Lúcio Costa — el hombre que dibujó la ciudad</h3>
<p>En 1957, Lúcio Costa ganó el concurso del Plan Piloto con un gesto casi simple: el cruce de dos ejes, como quien hace la señal de la cruz o abre los brazos para tomar posesión de un lugar. De ese trazo nacieron el Eje Monumental y el Eje Vial, las supercuadras, la escala monumental de los poderes y la escala humana de quien vive. Costa no diseñó edificios — diseñó <em>cómo se vive</em>. Entender Brasília empieza por entender que todo allí tiene intención.</p>

<h3>Oscar Niemeyer — la curva que se volvió símbolo</h3>
<p>Si Lúcio Costa dio la lógica, Niemeyer dio la poesía. "No es el ángulo recto lo que me atrae, ni la línea recta, dura, inflexible. Lo que me atrae es la curva libre y sensual", escribió. Sus curvas están en la Catedral que parece manos alzadas al cielo, en las columnas del Alvorada, en la cúpula y la cuenca del Congreso. Niemeyer demostró que el hormigón armado podía ser ligero, lírico, brasileño. Proyectó los principales monumentos de la capital — y siguió creando hasta morir, a los 104 años.</p>

${h.fig(2, { legenda: 'Las 16 columnas de la Catedral Metropolitana, que se elevan como manos en oración.' })}

<h3>Roberto Burle Marx — el jardín como obra de arte</h3>
<p>La Brasília que ves no es solo hormigón y cielo: también es verde diseñado. Burle Marx trató el paisajismo como pintura — masas de plantas tropicales componiendo formas orgánicas que dialogan con la arquitectura. Él enseñó al mundo a mirar la flora brasileña como patrimonio, no como maleza. Los jardines de Itamaraty son una de sus obras maestras. <a href="${h.L('/blog/paisagismo.html')}">Le dedicamos toda la guía de paisajismo →</a></p>

<h3>Athos Bulcão — el arte que cubre la ciudad</h3>
<p>Mira las paredes. Los azulejos blancos y azules de la iglesita Nossa Senhora de Fátima, los paneles del aeropuerto, los relieves repartidos por decenas de edificios: son de Athos Bulcão, el artista que vistió Brasília. Su trabajo con patrones modulares — repetición con variación, nunca idéntica — es la prueba de que el modernismo brasileño tenía calor, color y mano de artista.</p>

<h2>El itinerario esencial de la arquitectura</h2>
<p>Si tienes un día, hazlo en este orden — así ayudan la luz y el tráfico:</p>
<ul class="artigo-lista">
  <li><strong>Mañana — Praça dos Três Poderes.</strong> El corazón simbólico de la República: el Planalto, el Supremo Tribunal y el Congreso alrededor de una plaza que es, ella misma, un museo al aire libre. Empieza temprano, antes del sol fuerte.</li>
  <li><strong>Media mañana — Catedral Metropolitana.</strong> Por fuera, las 16 columnas hiperboloides; por dentro, la luz que baja por los vitrales de Marianne Peretti y los ángeles de Alfredo Ceschiatti suspendidos. Puede ser lo más bonito de la ciudad.</li>
  <li><strong>Almuerzo — Itamaraty o Asa Sul.</strong> El Palacio de Itamaraty, con sus arcos sobre el espejo de agua y los jardines de Burle Marx, es parada obligatoria. <a href="${h.L('/blog/gastronomia.html')}">Dónde comer está en la guía de gastronomía →</a></li>
  <li><strong>Tarde — Memorial JK y Eje Monumental.</strong> El mausoleo de Juscelino, con la estatua bajo la hoz estilizada, cierra el sentido de todo: aquí descansa quien tuvo el coraje de construir esto.</li>
  <li><strong>Atardecer — Ermida Dom Bosco.</strong> Pequeña capilla de Niemeyer (1957) asomada sobre el Lago Paranoá. El mejor final de tarde de Brasília, y a 10 minutos de nuestras casas.</li>
</ul>

${h.fig(3, { legenda: 'El Congreso Nacional: la cúpula, la cuenca y las torres gemelas en el eje de la Esplanada.' })}

<h2>Por qué esto importa para tu viaje</h2>
<p>Porque Brasília no se entrega a quien pasa corriendo. Se revela a quien sabe lo que está viendo — y a quien se queda lo bastante cerca para volver a la Catedral al atardecer, o atrapar la Ermida en el momento justo. Con esa mirada nació Villela Stay: casas en el Lago Sul que pertenecen al mismo linaje estético de la ciudad — integradas al jardín, abiertas a la luz, sin excesos. No visitas la arquitectura de Brasília. Te despiertas dentro de ella.</p>
`,
    },
  },
  roteiros: {
    en: {
      titulo: 'Brasília itineraries: what to do in 1, 3 or 5 days in the capital | Villela Stay',
      descricao: 'Ready-made itineraries for Brasília — civic, cultural, gastronomic and outdoor. What to see, in what order and where to stay to enjoy the city without wasting time in traffic.',
      h1: 'Brasília in 1, 3 or 5 days — without missing the best',
      dek: 'The capital is large, planned and spread out. With the right itinerary (and staying in the right place), you see the essentials at a calm pace — with time left over for the sunset over the lake.',
      casasTitulo: 'Stay in Lago Sul — close to everything, far from the rush',
      casasTexto: '10 minutes from JK Airport and the Esplanada, Lago Sul is the ideal base for your itinerary: you come home between outings, get real rest and catch the Ermida Dom Bosco at sunset.',
      isca: { titulo: "3-Day Brasília Itinerary (host's PDF)", texto: 'The step-by-step plan we put together for our guests: what to see in the morning, afternoon and evening, with timing and traffic tips. Download now.', botao: 'I want the 3-day itinerary' },
      faq: [
        { q: 'How many days are ideal to get to know Brasília?', a: 'Three days cover the essentials comfortably: one day for the civic route (Esplanada, Três Poderes, Cathedral), one for culture and food (museums, Pontão, restaurants) and one for the outdoors (Botanical Garden, Lake Paranoá, Ermida Dom Bosco). Five days let you add the surroundings — Cidade Ocidental, Chapada Imperial and waterfalls.' },
        { q: 'Do you need a car to get around Brasília?', a: "It helps a lot. The city was designed for the car and the sights are far apart. Rideshare apps work well, but a car gives you freedom — and, staying in Lago Sul, you're minutes from the main attractions." },
        { q: 'When is the best time to visit?', a: 'The dry season (May to September) has the bluest sky and sunny days — great for photos and outdoor outings. The rainy season (October to April) leaves the city greener and the gardens lush. Just avoid the peak holidays (New Year, Carnival) if you want fewer crowds.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Brasília doesn't fit into an afternoon stroll. It was designed on a monumental scale — wide distances, long axes, open horizons. Those who arrive without an itinerary lose time in traffic and energy in the sun. Those who arrive with a plan (and stay in the right neighbourhood) discover one of the most surprising cities in Brazil. Here are the itineraries we put together for our guests.</p>

${h.fig(1, { legenda: 'The Praça dos Três Poderes and the Planalto Palace — the civic heart of the capital.' })}

<h2>1 day: the civic essentials</h2>
<p>If you only have one day, devote it to the axis that made Brasília a World Heritage Site:</p>
<ul class="artigo-lista">
  <li><strong>Morning:</strong> Praça dos Três Poderes — the Planalto Palace, the Supreme Court and the National Congress. Start early, before the heat.</li>
  <li><strong>Midday:</strong> the Metropolitan Cathedral and the Esplanada dos Ministérios, with its Niemeyer museums (the National Museum and the Library).</li>
  <li><strong>Afternoon:</strong> Memorial JK and the TV Tower (360° panoramic view).</li>
  <li><strong>Late afternoon:</strong> Ermida Dom Bosco, for the sunset over Lake Paranoá.</li>
</ul>
<p>Want to understand what you're seeing? The <a href="${h.L('/blog/arquitetura.html')}">architecture guide</a> explains each work and who designed it.</p>

${h.fig(2, { legenda: "The dome of the National Museum, by Niemeyer, on the Esplanada dos Ministérios." })}

<h2>3 days: city, culture and nature</h2>
<p>With three days, you breathe the city in instead of just photographing it.</p>
<h3>Day 1 — Civic</h3>
<p>The route above, unhurried, with lunch in Asa Sul.</p>
<h3>Day 2 — Culture and leisure</h3>
<p>Morning at the Dom Bosco Sanctuary (the blue stained glass is breathtaking), afternoon at the <strong>Pontão do Lago Sul</strong> — the waterfront hotspot with restaurants, a promenade and boats — and an evening of fine food. The best tables are in the <a href="${h.L('/blog/gastronomia.html')}">food guide</a>.</p>
<h3>Day 3 — Outdoors</h3>
<p>The Brasília Botanical Garden or Parque da Cidade in the morning, and in the afternoon the <strong>Catetinho</strong> — Juscelino's first home in the city, built in ten days, today a charming museum on the way to Lago Sul.</p>

${h.fig(3, { legenda: 'The Pontão do Lago Sul promenade, by the Paranoá — sunset and dining.' })}

<h2>5 days: Brasília + surroundings</h2>
<p>Five days make room for what few tourists see: the <strong>Chapada Imperial</strong> and its waterfalls an hour from the city, the <strong>Vale do Amanhecer</strong> in Planaltina, the Lago Norte lookouts and a whole day just on the lake — paddleboarding, boating, sunset. That's when Brasília stops being "the city of government buildings" and becomes a real destination.</p>

${h.fig(4, { legenda: "The Catetinho, JK's first home in Brasília — built in ten days." })}

<h2>The secret to a good itinerary: where you sleep</h2>
<p>The biggest mistake tourists make in Brasília is staying far away and spending the day in traffic. Staying in <strong>Lago Sul</strong> changes the trip: you're minutes from the Esplanada, the Pontão and the Ermida, in a leafy, safe neighbourhood, and you return to a real house — with a pool, a kitchen and space — between outings. It's the itinerary working for you, not against you.</p>
`,
    },
    es: {
      titulo: 'Itinerarios de Brasília: qué hacer en 1, 3 y 5 días en la capital | Villela Stay',
      descricao: 'Itinerarios listos para Brasília — cívico, cultural, gastronómico y al aire libre. Qué ver, en qué orden y dónde alojarse para disfrutar la ciudad sin perder tiempo en el tráfico.',
      h1: 'Brasília en 1, 3 o 5 días — sin perderte lo mejor',
      dek: 'La capital es grande, planificada y extensa. Con el itinerario correcto (y alojándote en el lugar correcto), ves lo esencial con calma — y aún sobra tiempo para el atardecer sobre el lago.',
      casasTitulo: 'Alójate en Lago Sul — cerca de todo, lejos del ajetreo',
      casasTexto: 'A 10 minutos del Aeropuerto JK y de la Esplanada, el Lago Sul es la base ideal para tu itinerario: vuelves a casa entre paseo y paseo, descansas de verdad y atrapas la Ermida Dom Bosco a la hora del atardecer.',
      isca: { titulo: 'Itinerario de 3 días en Brasília (PDF del anfitrión)', texto: 'El paso a paso que armamos para nuestros huéspedes: qué ver por la mañana, por la tarde y por la noche, con consejos de horario y tráfico. Descárgalo ahora.', botao: 'Quiero el itinerario de 3 días' },
      faq: [
        { q: '¿Cuántos días son ideales para conocer Brasília?', a: 'Tres días cubren lo esencial con tranquilidad: un día para la ruta cívica (Esplanada, Três Poderes, Catedral), uno para la cultura y la gastronomía (museos, Pontão, restaurantes) y uno para el aire libre (Jardín Botánico, Lago Paranoá, Ermida Dom Bosco). Cinco días permiten incluir los alrededores — Cidade Ocidental, Chapada Imperial y cascadas.' },
        { q: '¿Hace falta coche para moverse por Brasília?', a: 'Ayuda mucho. La ciudad fue diseñada para el coche y los puntos turísticos están lejos entre sí. Las apps de transporte funcionan bien, pero un coche da libertad — y, alojándote en el Lago Sul, estás a pocos minutos de las principales atracciones.' },
        { q: '¿Cuál es la mejor época para visitar?', a: 'La estación seca (mayo a septiembre) tiene el cielo más azul y días soleados — ideal para fotos y paseos al aire libre. La estación de lluvias (octubre a abril) deja la ciudad más verde y los jardines exuberantes. Solo evita los feriados pico (Fin de Año, Carnaval) si quieres menos gente.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Brasília no cabe en un paseo de tarde. Fue diseñada a escala monumental — distancias amplias, ejes largos, horizontes abiertos. Quien llega sin itinerario pierde tiempo en el tráfico y energía bajo el sol. Quien llega con un plan (y se aloja en el barrio correcto) descubre una de las ciudades más sorprendentes de Brasil. Aquí están los itinerarios que armamos para nuestros huéspedes.</p>

${h.fig(1, { legenda: 'La Praça dos Três Poderes y el Palacio del Planalto — el corazón cívico de la capital.' })}

<h2>1 día: lo esencial cívico</h2>
<p>Si solo tienes un día, dedícalo al eje que convirtió a Brasília en Patrimonio de la Humanidad:</p>
<ul class="artigo-lista">
  <li><strong>Mañana:</strong> Praça dos Três Poderes — el Palacio del Planalto, el Supremo Tribunal y el Congreso Nacional. Empieza temprano, antes del calor.</li>
  <li><strong>Mediodía:</strong> la Catedral Metropolitana y la Esplanada dos Ministérios, con sus museos de Niemeyer (el Museo Nacional y la Biblioteca).</li>
  <li><strong>Tarde:</strong> Memorial JK y la Torre de TV (vista panorámica de 360°).</li>
  <li><strong>Final de la tarde:</strong> Ermida Dom Bosco, para la puesta de sol sobre el Lago Paranoá.</li>
</ul>
<p>¿Quieres entender lo que estás viendo? La <a href="${h.L('/blog/arquitetura.html')}">guía de arquitectura</a> explica cada obra y quién la proyectó.</p>

${h.fig(2, { legenda: 'La cúpula del Museo Nacional, de Niemeyer, en la Esplanada dos Ministérios.' })}

<h2>3 días: ciudad, cultura y naturaleza</h2>
<p>Con tres días, respiras la ciudad en vez de solo fotografiarla.</p>
<h3>Día 1 — Cívico</h3>
<p>La ruta de arriba, sin prisa, con almuerzo en Asa Sul.</p>
<h3>Día 2 — Cultura y ocio</h3>
<p>Mañana en el Santuario Dom Bosco (los vitrales azules quitan el aliento), tarde en el <strong>Pontão do Lago Sul</strong> — el punto a la orilla del agua con restaurantes, paseo y barcos — y noche de buena gastronomía. Las mejores mesas están en la <a href="${h.L('/blog/gastronomia.html')}">guía de gastronomía</a>.</p>
<h3>Día 3 — Aire libre</h3>
<p>El Jardín Botánico de Brasília o el Parque da Cidade por la mañana, y por la tarde el <strong>Catetinho</strong> — la primera residencia de Juscelino en la ciudad, levantada en diez días, hoy un museo encantador de camino al Lago Sul.</p>

${h.fig(3, { legenda: 'El paseo del Pontão do Lago Sul, a la orilla del Paranoá — atardecer y gastronomía.' })}

<h2>5 días: Brasília + alrededores</h2>
<p>Cinco días abren espacio para lo que pocos turistas ven: la <strong>Chapada Imperial</strong> y sus cascadas a una hora de la ciudad, el <strong>Vale do Amanhecer</strong> en Planaltina, los miradores del Lago Norte y un día entero solo de lago — paddle surf, lancha, atardecer. Es cuando Brasília deja de ser "la ciudad de los edificios del gobierno" y se vuelve un destino de verdad.</p>

${h.fig(4, { legenda: 'El Catetinho, primera morada de JK en Brasília — levantado en diez días.' })}

<h2>El secreto de un buen itinerario: dónde duermes</h2>
<p>El mayor error del turista en Brasília es alojarse lejos y gastar el día en el tráfico. Quedarse en el <strong>Lago Sul</strong> cambia el viaje: estás a minutos de la Esplanada, del Pontão y de la Ermida, en un barrio arbolado y seguro, y vuelves a una casa de verdad — con piscina, cocina y espacio — entre paseo y paseo. Es el itinerario trabajando a tu favor, no en tu contra.</p>
`,
    },
  },
  gastronomia: {
    en: {
      titulo: 'Brasília food: where to eat and the flavours of the Cerrado | Villela Stay',
      descricao: "From the fine dining of Asa Sul to the flavours of the Cerrado — pequi, baru, buriti. The host's guide to eating well in Brasília, with restaurant tips and the local kitchen.",
      h1: 'In Brasília, you eat all of Brazil on one plate',
      dek: "A city made of migrants from every state created a plural food scene — and put down roots in the Cerrado, the country's most flavourful and least known biome.",
      casasTitulo: 'A gourmet kitchen to entertain — or just relax',
      casasTexto: 'Our houses have a full kitchen and room to gather people around the table. Host a chef at home, put on a dinner for the group or simply cook at your own pace after a day at the market. Hospitality is also about the table.',
      isca: { titulo: "Host's restaurant guide (PDF)", texto: 'The tables we recommend to our guests — by area and by occasion, from the local happy hour to a special night. Download now.', botao: 'I want the restaurant guide' },
      faq: [
        { q: 'What is the typical food of Brasília?', a: 'Brasília doesn\'t have a single "typical food" — it was formed by migrants from all over Brazil, so it brings together the cuisine of Goiás (galinhada, pamonha, pequi), Minas Gerais, the Northeast and the Cerrado itself. Pequi, baru and buriti are the region\'s signature ingredients.' },
        { q: 'What is pequi and how do you eat it?', a: 'Pequi is a Cerrado fruit with an intense aroma and a unique flavour, much used in rice with pequi and in galinhada. A famous warning: never bite it — the pit has very fine spines. You eat it by gently scraping the flesh with your teeth. It\'s an experience every visitor should try at least once.' },
        { q: 'Where to eat well in Brasília?', a: "Asa Sul (especially the 400 and 200 blocks) concentrates fine dining; the Pontão do Lago Sul has waterfront restaurants; and Asa Norte holds bars and signature houses. We keep a guide updated by season — request the host's PDF on this page." },
      ],
      corpo: (h) => `
<p class="artigo-lead">Brasília is the only Brazilian capital without a "native" cuisine — and that's exactly what makes it delicious. Built by people who came from Minas, Goiás, the Northeast, the South and the world, the city put everything on the same table. Here you have an Amazonian fish for dinner, a Goiás-style galinhada for lunch and end the night at a French-inspired bistro — sometimes on the same block.</p>

${h.fig(1, { legenda: 'Rice with pequi — the signature flavour of the Cerrado, intense and unmistakable.' })}

<h2>The flavours of the Cerrado</h2>
<p>The biome that surrounds Brasília is a little-explored pantry — and the city's chefs have rediscovered it. Worth tasting:</p>
<ul class="artigo-lista">
  <li><strong>Pequi:</strong> strong aroma, striking flavour, the star of rice with pequi and of galinhada. (Never bite the pit!)</li>
  <li><strong>Baru:</strong> the Cerrado nut, crunchy and nutritious, which became a darling of fine dining and pastry.</li>
  <li><strong>Buriti:</strong> the orange fruit that becomes a sweet, an ice cream and a liqueur — the "gold" of the wetlands.</li>
  <li><strong>Cagaita, mangaba and cajuzinho-do-cerrado:</strong> native fruits that appear in signature desserts and juices.</li>
</ul>

${h.fig(2, { legenda: 'The baru, a Cerrado native nut, now coveted by fine dining.' })}

<h2>Where to eat, by occasion</h2>
<h3>For a special night</h3>
<p><strong>Asa Sul</strong> brings together the city's fine dining — signature cuisine, a wine list, polished service. It's the area for celebrations.</p>
<h3>With a water view</h3>
<p>The <strong>Pontão do Lago Sul</strong> lines up restaurants by the Paranoá: perfect for late afternoon, 10 minutes from our houses. It pairs perfectly with the <a href="${h.L('/blog/roteiros.html')}">3-day itinerary</a>.</p>
<h3>Roots cooking</h3>
<p>To feel the local soul, seek out the Goiás and Minas eateries and the bars of Asa Norte — galinhada, pamonha, empadão goiano and the traditional Brasília happy hour.</p>

${h.fig(3, { legenda: 'Feijoada: the migrant Brazil that built the Brasília table.' })}

<h2>The best table can be your own</h2>
<p>There is something no restaurant offers: cooking (or being served) in the privacy of a house, with your people, with no closing time. That's why our stays have a <strong>full gourmet kitchen and room to entertain</strong> — you can call a private chef, set up a paired dinner for the group or simply make breakfast with fruit from the market. In Brasília, hospitality also happens at the table — and yours can be the best one of the trip.</p>
`,
    },
    es: {
      titulo: 'Gastronomía de Brasília: dónde comer y los sabores del Cerrado | Villela Stay',
      descricao: 'De la alta gastronomía de Asa Sul a los sabores del Cerrado — pequi, baru, buriti. La guía del anfitrión para comer bien en Brasília, con recomendaciones de restaurantes y la cocina local.',
      h1: 'Brasília se come con todo Brasil en el plato',
      dek: 'Una ciudad hecha de migrantes de todos los estados creó una escena gastronómica plural — y echó raíces en el Cerrado, el bioma más sabroso y menos conocido del país.',
      casasTitulo: 'Cocina gourmet para recibir — o solo relajarte',
      casasTexto: 'Nuestras casas tienen cocina completa y espacio para reunir gente a la mesa. Recibe a un chef en casa, organiza una cena para el grupo o simplemente cocina con calma tras un día de mercado. La hospitalidad también es sobre la mesa.',
      isca: { titulo: 'Guía de restaurantes del anfitrión (PDF)', texto: 'Las mesas que recomendamos a nuestros huéspedes — por zona y por ocasión, del happy hour local a la noche especial. Descárgala ahora.', botao: 'Quiero la guía de restaurantes' },
      faq: [
        { q: '¿Cuál es la comida típica de Brasília?', a: 'Brasília no tiene una única "comida típica" — se formó con migrantes de todo Brasil, así que reúne la cocina goiana (galinhada, pamonha, pequi), la minera, la nordestina y la del propio Cerrado. El pequi, el baru y el buriti son los ingredientes-firma de la región.' },
        { q: '¿Qué es el pequi y cómo se come?', a: 'El pequi es un fruto del Cerrado de aroma intenso y sabor único, muy usado en el arroz con pequi y en la galinhada. Advertencia famosa: nunca lo muerdas — el hueso tiene espinas finísimas. Se come raspando la pulpa con los dientes, con suavidad. Es una experiencia que todo visitante debería probar al menos una vez.' },
        { q: '¿Dónde comer bien en Brasília?', a: 'Asa Sul (sobre todo las cuadras 400 y 200) concentra la alta gastronomía; el Pontão do Lago Sul tiene restaurantes a la orilla del agua; y Asa Norte guarda bares y casas de autor. Mantenemos una guía actualizada por temporada — solicita el PDF del anfitrión en esta página.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Brasília es la única capital brasileña sin una cocina "nativa" — y es justamente eso lo que la hace deliciosa. Construida por gente que vino de Minas, de Goiás, del Nordeste, del Sur y del mundo, la ciudad puso todo en la misma mesa. Aquí cenas un pescado amazónico, almuerzas una galinhada goiana y cierras la noche en un bistró de inspiración francesa — a veces en la misma cuadra.</p>

${h.fig(1, { legenda: 'Arroz con pequi — el sabor-firma del Cerrado, intenso e inconfundible.' })}

<h2>Los sabores del Cerrado</h2>
<p>El bioma que rodea Brasília es una despensa poco explorada — y los chefs de la ciudad lo redescubrieron. Vale la pena probar:</p>
<ul class="artigo-lista">
  <li><strong>Pequi:</strong> aroma fuerte, sabor marcado, estrella del arroz con pequi y de la galinhada. (¡Nunca muerdas el hueso!)</li>
  <li><strong>Baru:</strong> la castaña del Cerrado, crocante y nutritiva, que se volvió la consentida de la alta gastronomía y la repostería.</li>
  <li><strong>Buriti:</strong> el fruto anaranjado que se vuelve dulce, helado y licor — el "oro" de los humedales.</li>
  <li><strong>Cagaita, mangaba y cajuzinho-do-cerrado:</strong> frutas nativas que aparecen en postres de autor y jugos.</li>
</ul>

${h.fig(2, { legenda: 'El baru, castaña nativa del Cerrado, hoy codiciada por la alta gastronomía.' })}

<h2>Dónde comer, por ocasión</h2>
<h3>Para una noche especial</h3>
<p>La <strong>Asa Sul</strong> reúne la alta gastronomía de la ciudad — cocina de autor, carta de vinos, servicio afinado. Es la zona de las celebraciones.</p>
<h3>Con vista al agua</h3>
<p>El <strong>Pontão do Lago Sul</strong> alinea restaurantes a la orilla del Paranoá: ideal para el final de la tarde, a 10 minutos de nuestras casas. Combina perfectamente con el <a href="${h.L('/blog/roteiros.html')}">itinerario de 3 días</a>.</p>
<h3>Comida de raíz</h3>
<p>Para sentir el alma local, busca las casas de comida goiana y minera y los bares de Asa Norte — galinhada, pamonha, empadão goiano y el tradicional happy hour brasiliense.</p>

${h.fig(3, { legenda: 'Feijoada: el Brasil migrante que formó la mesa de Brasília.' })}

<h2>La mejor mesa puede ser la tuya</h2>
<p>Hay algo que ningún restaurante ofrece: cocinar (o ser servido) en la privacidad de una casa, con los tuyos, sin hora para terminar. Por eso nuestros alojamientos tienen <strong>cocina gourmet completa y espacio para recibir</strong> — puedes llamar a un chef privado, montar una cena maridada para el grupo o simplemente preparar un desayuno con las frutas del mercado. En Brasília, la hospitalidad también se hace a la mesa — y la tuya puede ser la mejor del viaje.</p>
`,
    },
  },
  paisagismo: {
    en: {
      titulo: 'Landscaping in Brasília: Burle Marx, the Cerrado and the garden as art | Villela Stay',
      descricao: "Burle Marx's gardens, the Botanical Garden and the flora of the Cerrado. How modernist landscaping shaped Brasília — and ideas for a garden that withstands the hot, dry climate.",
      h1: 'In Brasília, the garden was designed too',
      dek: 'Before the world spoke of nature and architecture together, Burle Marx was already painting with plants on the Central Plateau. Discover the landscaping that makes the capital as green as it is monumental.',
      casasTitulo: 'Wake up surrounded by green',
      casasTexto: 'Our houses integrate garden, pool and architecture — the same idea Burle Marx brought to Brasília. The Jardim dos Sentidos is its fullest expression: a stay where landscaping is part of the experience, not a backdrop.',
      isca: { titulo: 'Mini-guide: a garden that withstands the Brasília climate (PDF)', texto: 'The plants, the trees and the landscaping tricks that survive the hot, dry Plateau — and keep any yard beautiful all year. Download now.', botao: 'I want the mini-guide' },
      faq: [
        { q: 'Who was Roberto Burle Marx?', a: 'Roberto Burle Marx (1909–1994) was a Brazilian landscape architect, painter, botanist and visual artist, internationally recognised for turning landscaping into art. He pioneered the use of native tropical plants and designed iconic gardens in Brasília, Rio and around the world. In Brasília, he is behind the Itamaraty gardens, among others.' },
        { q: "What to plant in a hot, dry garden like Brasília's?", a: 'Species adapted to drought and strong sun work best: Cerrado plants, succulents, ipês, bougainvillea, agaves and ornamental grasses. The secret is to work with native vegetation — which withstands the dry spell — and to plan shade and efficient irrigation for the dry months.' },
        { q: 'Is the Brasília Botanical Garden worth visiting?', a: 'Yes. The Brasília Botanical Garden preserves the Cerrado flora across trails, lakes and themed gardens, great for walks and contact with native nature. It pairs very well with the third day of a city itinerary.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">When you think of Brasília, the concrete comes to mind — the Cathedral, the Congress, the palaces. But there is a second Brasília, equally designed: the green one. Before "sustainable architecture" became a buzzword, Roberto Burle Marx already treated the garden as part of the work, not as an ornament. This is the city seen through landscaping.</p>

${h.fig(1, { legenda: 'Burle Marx gardens in Brasília: masses of tropical plants composed like a painting.' })}

<h2>Burle Marx: the man who painted with plants</h2>
<p>Burle Marx discovered Brazilian flora in a greenhouse in Berlin, Germany — there he saw the plants that grew ignored in his own backyard and realised they were a treasure. He returned to Brazil and revolutionised landscaping: instead of copying European geometric gardens, he composed <strong>organic masses of tropical species</strong>, like brushstrokes on a canvas. In Brasília, his designs converse with Niemeyer's curves — nature and architecture speaking the same modern language. <a href="${h.L('/blog/personalidades.html')}">He is one of the names that gave the city its soul →</a></p>

${h.fig(2, { legenda: 'The Brasília Botanical Garden preserves the Cerrado across trails and reflecting pools.' })}

<h2>The Cerrado: beauty that looks dry but is alive</h2>
<p>The biome surrounding Brasília is Brazil's second largest — and one of the most misunderstood. At first glance, twisted trees and grass. Up close, one of the richest floras on the planet: the ipê that blooms yellow, pink and purple at the height of the dry season, the native fruits, the buriti wetlands. The Cerrado teaches a landscaping lesson the world is now rediscovering: to work <em>with</em> the climate, not against it.</p>

${h.fig(3, { legenda: 'Cerrado vegetation: a rustic look, very rich biodiversity.' })}

<h2>A garden that withstands the Plateau</h2>
<p>Anyone who lives in or stays in Brasília learns quickly: the climate is hot and dry for much of the year, with months without rain. A garden that thrives here is a smart garden — native, adapted species, planned shade, efficient irrigation. Some choices that work:</p>
<ul class="artigo-lista">
  <li><strong>Trees:</strong> ipês, oitis and the generous shade of the flamboyant.</li>
  <li><strong>Colour all year:</strong> bougainvillea (spring), which loves sun and drought.</li>
  <li><strong>Low maintenance:</strong> agaves, succulents and ornamental grasses.</li>
  <li><strong>Local identity:</strong> Cerrado species that belong to the land.</li>
</ul>

<h2>When the garden is part of the stay</h2>
<p>It was this philosophy — integrating green, water and architecture — that guided our houses. The <strong>Jardim dos Sentidos</strong> takes the idea to its limit: landscaping designed to be lived in, not just admired. Waking to birdsong, having coffee among the plants, diving into a pool surrounded by green. In Brasília, the garden was never an accessory. At Villela Stay, neither is it.</p>
`,
    },
    es: {
      titulo: 'Paisajismo en Brasília: Burle Marx, el Cerrado y el jardín como arte | Villela Stay',
      descricao: 'Los jardines de Burle Marx, el Jardín Botánico y la flora del Cerrado. Cómo el paisajismo modernista moldeó Brasília — e ideas para un jardín que resiste el clima caluroso y seco.',
      h1: 'En Brasília, el jardín también fue proyectado',
      dek: 'Antes de que el mundo hablara de naturaleza y arquitectura juntas, Burle Marx ya pintaba con plantas en el Planalto Central. Conoce el paisajismo que hace de la capital una ciudad tan verde como monumental.',
      casasTitulo: 'Despierta rodeado de verde',
      casasTexto: 'Nuestras casas integran jardín, piscina y arquitectura — la misma idea que Burle Marx llevó a Brasília. El Jardim dos Sentidos es su máxima expresión: un alojamiento donde el paisajismo es parte de la experiencia, no escenario.',
      isca: { titulo: 'Mini-guía: un jardín que resiste el clima de Brasília (PDF)', texto: 'Las plantas, los árboles y los trucos de paisajismo que sobreviven al Planalto caluroso y seco — y dejan cualquier patio bonito todo el año. Descárgala ahora.', botao: 'Quiero la mini-guía' },
      faq: [
        { q: '¿Quién fue Roberto Burle Marx?', a: 'Roberto Burle Marx (1909–1994) fue paisajista, pintor, botánico y artista plástico brasileño, reconocido internacionalmente por convertir el paisajismo en arte. Fue pionero en el uso de plantas tropicales nativas y diseñó jardines emblemáticos en Brasília, Río y por el mundo. En Brasília, firma los jardines de Itamaraty, entre otros.' },
        { q: '¿Qué plantar en un jardín de clima caluroso y seco como el de Brasília?', a: 'Las especies adaptadas a la sequía y al sol fuerte funcionan mejor: plantas del propio Cerrado, suculentas, ipês, buganvilla, agaves y gramíneas ornamentales. El secreto es trabajar con la vegetación nativa — que resiste la sequía — y prever sombra e irrigación eficiente para los meses secos.' },
        { q: '¿Vale la pena visitar el Jardín Botánico de Brasília?', a: 'Sí. El Jardín Botánico de Brasília preserva la flora del Cerrado en senderos, lagos y jardines temáticos, ideal para caminatas y contacto con la naturaleza nativa. Combina muy bien con el tercer día de un itinerario por la ciudad.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Cuando se piensa en Brasília, viene el hormigón — la Catedral, el Congreso, los palacios. Pero hay una segunda Brasília, igualmente proyectada: la verde. Antes de que "arquitectura sostenible" se volviera una expresión de moda, Roberto Burle Marx ya trataba el jardín como parte de la obra, y no como adorno. Esta es la ciudad vista por el paisajismo.</p>

${h.fig(1, { legenda: 'Jardines de Burle Marx en Brasília: masas de plantas tropicales compuestas como pintura.' })}

<h2>Burle Marx: el hombre que pintaba con plantas</h2>
<p>Burle Marx descubrió la flora brasileña en un invernadero de Berlín, en Alemania — vio allí las plantas que crecían ignoradas en el patio de su casa y comprendió que eran un tesoro. Volvió a Brasil y revolucionó el paisajismo: en vez de copiar los jardines geométricos europeos, compuso <strong>masas orgánicas de especies tropicales</strong>, como pinceladas en un lienzo. En Brasília, sus trazados dialogan con las curvas de Niemeyer — naturaleza y arquitectura hablando el mismo lenguaje moderno. <a href="${h.L('/blog/personalidades.html')}">Es uno de los nombres que dieron alma a la ciudad →</a></p>

${h.fig(2, { legenda: 'El Jardín Botánico de Brasília preserva el Cerrado en senderos y espejos de agua.' })}

<h2>El Cerrado: la belleza que parece seca, pero está viva</h2>
<p>El bioma que rodea Brasília es el segundo más grande de Brasil — y uno de los más incomprendidos. A primera vista, árboles torcidos y pasto. Mirando de cerca, una de las floras más ricas del planeta: el ipê que florece amarillo, rosa y morado en pleno apogeo de la seca, las frutas nativas, los humedales de buriti. El Cerrado enseña una lección de paisajismo que el mundo ahora redescubre: trabajar <em>con</em> el clima, no contra él.</p>

${h.fig(3, { legenda: 'La vegetación del Cerrado: apariencia rústica, biodiversidad riquísima.' })}

<h2>Un jardín que resiste el Planalto</h2>
<p>Quien vive o se aloja en Brasília aprende rápido: el clima es caluroso y seco buena parte del año, con meses sin lluvia. Un jardín que prospera aquí es un jardín inteligente — especies nativas y adaptadas, sombra pensada, irrigación eficiente. Algunas opciones que funcionan:</p>
<ul class="artigo-lista">
  <li><strong>Árboles:</strong> ipês, oitis y la sombra generosa del flamboyán.</li>
  <li><strong>Color todo el año:</strong> buganvilla (primavera), que adora el sol y la sequía.</li>
  <li><strong>Bajo mantenimiento:</strong> agaves, suculentas y gramíneas ornamentales.</li>
  <li><strong>Identidad local:</strong> especies del propio Cerrado, que pertenecen a la tierra.</li>
</ul>

<h2>Cuando el jardín es parte del alojamiento</h2>
<p>Fue esa filosofía — integrar verde, agua y arquitectura — la que guió nuestras casas. El <strong>Jardim dos Sentidos</strong> lleva la idea al límite: paisajismo pensado para ser vivido, no solo admirado. Despertar con el canto de los pájaros, tomar el café entre las plantas, sumergirse en la piscina rodeada de verde. En Brasília, el jardín nunca fue un accesorio. En Villela Stay, tampoco.</p>
`,
    },
  },
  personalidades: {
    en: {
      titulo: 'People of Brasília: who dreamed, built and sang the capital | Villela Stay',
      descricao: 'JK, Niemeyer, Lúcio Costa, Burle Marx, Athos Bulcão, Renato Russo and Cassia Eller: the people who made Brasília — and who give the Villela Stay houses their names.',
      h1: 'Brasília has a first and last name',
      dek: 'Behind the most planned city in the world there are people of flesh, bone and courage. Meet those who dreamed, drew, built and sang the capital — and why each of our houses carries one of these names.',
      casasTitulo: 'Stay in a living tribute',
      casasTexto: "Each Villela Stay house and suite carries the name of someone who made Brasília. Gathering your group at Gran Villela, Villa Kubitschek or Villa Catetinho is sleeping inside the city's history — with all of today's comfort.",
      isca: { titulo: 'Proposal for groups and themed events', texto: 'Gathering a group or hosting an event in Brasília? Download the presentation of the houses for groups and events — and talk to us for a tailor-made proposal.', botao: 'Download the group proposal' },
      faq: [
        { q: 'Who was responsible for building Brasília?', a: 'President Juscelino Kubitschek (JK) made the political decision and ran the project between 1956 and 1960. The urban plan is by Lúcio Costa, the architecture of the monuments by Oscar Niemeyer, the landscaping by Roberto Burle Marx and the integrated art by Athos Bulcão. It was a collective effort raised in little more than a thousand days.' },
        { q: 'Why is Brasília called the "Capital of Rock"?', a: "In the 1980s, the city revealed bands that marked Brazilian rock — Legião Urbana (Renato Russo's), Capital Inicial, Plebe Rude and Raimundos. Cassia Eller also started there. The bored, critical middle-class youth of the planned city became one of the most fertile music scenes in the country." },
        { q: 'Was Renato Russo from Brasília?', a: "Renato Russo was born in Rio de Janeiro, but it was in Brasília that he came of age as an artist and founded Legião Urbana, in the early 1980s. The city is an essential part of his story — and that's why one of our flats carries his name." },
      ],
      corpo: (h) => `
<p class="artigo-lead">Every city has its heroes. Brasília has hers carved in concrete, in garden, in tile and in song. They are people who bet on an idea that seemed impossible — to raise a capital in the middle of nowhere — and who then gave it a soul. To know them is to know the city from the inside.</p>

${h.fig(1, { legenda: 'Juscelino Kubitschek in 1956: the president who raised a capital in a thousand days.' })}

<h2>The founders</h2>
<h3>Juscelino Kubitschek — the courage</h3>
<p>Born in Diamantina, Minas Gerais, JK turned a campaign promise — "fifty years in five" — into the greatest work in Brazil's history. He faced scepticism, debt and the wilderness to deliver Brasília on 21 April 1960. Without his visionary stubbornness, the city wouldn't exist. Two of our houses honour him: <strong>Villa Kubitschek</strong> and <strong>Villa Catetinho</strong> — the latter recalls the Catetinho, his first home in the city.</p>

<h3>Lúcio Costa — the line</h3>
<p>The urban planner who designed the Pilot Plan with a gesture of two crossing axes. He invented the logic of living in Brasília: the superblocks, the human scale, the separation between the monumental and the everyday. <a href="${h.L('/blog/arquitetura.html')}">The city's architecture begins with him →</a></p>

<h3>Oscar Niemeyer — the curve</h3>
<p>The architect of free curves, who gave the capital its eternal symbols: the Cathedral, the Congress, the Alvorada, the Itamaraty. He worked until the age of 104 and is, probably, the best-known Brazilian in the history of world architecture.</p>

${h.fig(2, { legenda: 'Oscar Niemeyer, the architect of the curves that became the symbol of modern Brazil.' })}

<h2>The artists who gave it soul</h2>
<h3>Roberto Burle Marx — the garden</h3>
<p>He painted with plants. He turned Brazilian landscaping into art and taught the world to see tropical flora as heritage. The Itamaraty gardens and so many of the city's beds are his. <a href="${h.L('/blog/paisagismo.html')}">The landscaping guide is dedicated to him →</a></p>

<h3>Athos Bulcão — the colour</h3>
<p>He dressed Brasília in tile and relief. His modular panels — repetition that never repeats the same — are in the little church, the airport and dozens of buildings. They are proof that Brazilian modernism had an artist's hand and human warmth.</p>

${h.fig(3, { legenda: 'Athos Bulcão tiles: the artist who dressed the city in colour and rhythm.' })}

<h2>The soundtrack: the Capital of Rock</h2>
<p>After the founders came the voices. In the 1980s, the planned and silent city exploded in sound: <strong>Renato Russo</strong> and Legião Urbana, Capital Inicial, Plebe Rude, Raimundos and the young <strong>Cassia Eller</strong>. The restlessness of a generation raised among superblocks became some of the greatest anthems of Brazilian rock. That's why, at Villela Stay, the <strong>Flat do Renato Russo</strong> and the <strong>Suíte da Cassia Eller</strong> keep that memory.</p>

<h2>Sleep inside history</h2>
<p>It's no coincidence that each of our stays carries one of these names. It's a form of tribute — and of invitation. Gathering your group in a house called Kubitschek, Catetinho or Gran Villela is taking part, for a few days, in this story that is still being written.</p>
`,
    },
    es: {
      titulo: 'Personalidades de Brasília: quién soñó, construyó y cantó la capital | Villela Stay',
      descricao: 'JK, Niemeyer, Lúcio Costa, Burle Marx, Athos Bulcão, Renato Russo y Cassia Eller: las personalidades que hicieron Brasília — y que dan nombre a las casas de Villela Stay.',
      h1: 'Brasília tiene nombre y apellido',
      dek: 'Detrás de la ciudad más planificada del mundo hay personas de carne, hueso y coraje. Conoce a quienes soñaron, dibujaron, construyeron y cantaron la capital — y por qué cada casa nuestra lleva uno de estos nombres.',
      casasTitulo: 'Alójate en un homenaje vivo',
      casasTexto: 'Cada casa y suite de Villela Stay lleva el nombre de quien hizo Brasília. Reunir a tu grupo en la Gran Villela, la Villa Kubitschek o la Villa Catetinho es dormir dentro de la historia de la ciudad — con todo el confort de hoy.',
      isca: { titulo: 'Propuesta para grupos y eventos temáticos', texto: '¿Vas a reunir un grupo o hacer un evento en Brasília? Descarga la presentación de las casas para grupos y eventos — y habla con nosotros para una propuesta a medida.', botao: 'Descargar la propuesta para grupos' },
      faq: [
        { q: '¿Quién fue el responsable de construir Brasília?', a: 'El presidente Juscelino Kubitschek (JK) tomó la decisión política y dirigió la obra entre 1956 y 1960. El plan urbanístico es de Lúcio Costa, la arquitectura de los monumentos de Oscar Niemeyer, el paisajismo de Roberto Burle Marx y el arte integrado de Athos Bulcão. Fue un esfuerzo colectivo levantado en poco más de mil días.' },
        { q: '¿Por qué a Brasília se la llama "Capital del Rock"?', a: 'En los años 1980, la ciudad reveló bandas que marcaron el rock nacional — Legião Urbana (de Renato Russo), Capital Inicial, Plebe Rude y Raimundos. Cassia Eller también empezó allí. La juventud de clase media, aburrida y crítica de la ciudad planificada, se volvió una de las escenas musicales más fértiles del país.' },
        { q: '¿Renato Russo era de Brasília?', a: 'Renato Russo nació en Río de Janeiro, pero fue en Brasília donde se formó como artista y fundó Legião Urbana, a principios de los años 1980. La ciudad es parte esencial de su historia — y por eso uno de nuestros flats lleva su nombre.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Toda ciudad tiene héroes. Brasília tiene los suyos grabados en hormigón, en jardín, en azulejo y en canción. Son personas que apostaron por una idea que parecía imposible — levantar una capital en medio de la nada — y que, después, le dieron alma. Conocerlas es conocer la ciudad por dentro.</p>

${h.fig(1, { legenda: 'Juscelino Kubitschek en 1956: el presidente que levantó una capital en mil días.' })}

<h2>Los fundadores</h2>
<h3>Juscelino Kubitschek — el coraje</h3>
<p>Minero de Diamantina, JK transformó una promesa de campaña — "cincuenta años en cinco" — en la mayor obra de la historia de Brasil. Enfrentó el escepticismo, la deuda y el desierto para entregar Brasília el 21 de abril de 1960. Sin su terquedad visionaria, la ciudad no existiría. Dos de nuestras casas lo homenajean: la <strong>Villa Kubitschek</strong> y la <strong>Villa Catetinho</strong> — esta última recuerda al Catetinho, su primera morada en la ciudad.</p>

<h3>Lúcio Costa — el trazo</h3>
<p>El urbanista que diseñó el Plan Piloto con un gesto de dos ejes cruzados. Él inventó la lógica de vivir en Brasília: las supercuadras, la escala humana, la separación entre lo monumental y lo cotidiano. <a href="${h.L('/blog/arquitetura.html')}">La arquitectura de la ciudad empieza en él →</a></p>

<h3>Oscar Niemeyer — la curva</h3>
<p>El arquitecto de las curvas libres, que dio a la capital sus símbolos eternos: la Catedral, el Congreso, el Alvorada, el Itamaraty. Trabajó hasta los 104 años y es, probablemente, el brasileño más conocido en la historia de la arquitectura mundial.</p>

${h.fig(2, { legenda: 'Oscar Niemeyer, el arquitecto de las curvas que se volvieron el símbolo del Brasil moderno.' })}

<h2>Los artistas que dieron alma</h2>
<h3>Roberto Burle Marx — el jardín</h3>
<p>Pintó con plantas. Transformó el paisajismo brasileño en arte y enseñó al mundo a ver la flora tropical como patrimonio. Los jardines de Itamaraty y tantos canteros de la ciudad son suyos. <a href="${h.L('/blog/paisagismo.html')}">La guía de paisajismo está dedicada a él →</a></p>

<h3>Athos Bulcão — el color</h3>
<p>Vistió Brasília de azulejo y relieve. Sus paneles modulares — repetición que nunca se repite igual — están en la iglesita, en el aeropuerto y en decenas de edificios. Son la prueba de que el modernismo brasileño tenía mano de artista y calor humano.</p>

${h.fig(3, { legenda: 'Azulejos de Athos Bulcão: el artista que vistió la ciudad de color y ritmo.' })}

<h2>La banda sonora: la Capital del Rock</h2>
<p>Después de los fundadores, vinieron las voces. En los años 1980, la ciudad planificada y silenciosa explotó en sonido: <strong>Renato Russo</strong> y Legião Urbana, Capital Inicial, Plebe Rude, Raimundos y la joven <strong>Cassia Eller</strong>. La inquietud de una generación criada entre supercuadras se volvió algunos de los mayores himnos del rock brasileño. Por eso, en Villela Stay, el <strong>Flat do Renato Russo</strong> y la <strong>Suíte da Cassia Eller</strong> guardan esa memoria.</p>

<h2>Duerme dentro de la historia</h2>
<p>No es casualidad que cada alojamiento nuestro lleve uno de estos nombres. Es una forma de homenaje — y de invitación. Reunir a tu grupo en una casa que se llama Kubitschek, Catetinho o Gran Villela es formar parte, por unos días, de esa historia que todavía se está escribiendo.</p>
`,
    },
  },
  containers: {
    en: {
      titulo: 'Modular construction with containers: how it works and why it captivates | Villela Stay',
      descricao: 'Houses and spaces made from shipping containers: advantages, build stages, thermal and acoustic insulation, and why modular construction became an architecture trend.',
      h1: 'The house that arrives ready on a truck',
      dek: 'Fast, sustainable and surprisingly sophisticated: modular construction with shipping containers left the niche and became desirable architecture. Understand how it works — and why it interests us so much.',
      casasTitulo: 'The same obsession with good spaces',
      casasTexto: 'What draws us to modular construction is what moves us in our stays: well-thought-out, efficient spaces full of personality. Discover the Villela Stay houses — and talk to us if you want to swap ideas about projects.',
      isca: { titulo: 'Checklist: thinking about a container house (PDF)', texto: 'The step-by-step, the things nobody tells you (insulation, metalwork, timelines) and what to assess before starting a modular project. Download now.', botao: 'I want the checklist' },
      faq: [
        { q: 'How long does a container build take?', a: 'Much less than conventional construction. Since much of the work (structure, cuts, installations, finishes) happens in parallel and in a controlled environment, a residential container project can be ready in weeks to a few months, versus many months or years of a traditional build. The final timeline depends on size and finish.' },
        { q: 'Is a container house hot?', a: "Without treatment, yes — steel conducts a lot of heat. That's why thermal insulation is the most important stage: rock or PET wool, a ventilated roof, drywall and good solar orientation turn the container into a comfortable space, even in a hot climate like Brasília's. Done well, it's as pleasant as any brick house." },
        { q: 'Is modular construction cheaper?', a: 'It tends to be more economical and, above all, more predictable: less waste, less build time and fewer budget surprises. The final cost varies with finish, installations and insulation — a sophisticated project can approach high-end masonry, but with timeline and sustainability in its favour.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Imagine a house that is born in a workshop, travels by truck and is assembled on site in a matter of days. It's not futurism — it's modular construction with shipping containers, one of the most elegant ideas in contemporary architecture. What began as improvised shelter became an object of desire: houses, offices, cafés and inns that combine speed, sustainability and chic industrial aesthetics.</p>

${h.fig(1, { legenda: 'Shipping containers turned into construction — a ready structure, assembled on site.' })}

<h2>Why containers captivate</h2>
<ul class="artigo-lista">
  <li><strong>Speed:</strong> the structure already exists. Much of the work happens in parallel, in a controlled environment — the timeline plummets.</li>
  <li><strong>Sustainability:</strong> reusing a container gives new life to the steel, with far less rubble and waste than conventional construction.</li>
  <li><strong>Predictability:</strong> fewer budget and schedule surprises, because the module is standardised.</li>
  <li><strong>Aesthetics:</strong> the industrial lines, the large glass openings and the flexibility to stack and combine modules create spaces with personality.</li>
</ul>

<h2>How a container house comes to life</h2>
<p>The charm is in the details — and each stage has its craft:</p>
<ul class="artigo-lista">
  <li><strong>Acquisition and transport:</strong> choosing the right container (20- or 40-foot are the most used) and taking it to the site.</li>
  <li><strong>Foundation and levelling:</strong> preparing the base that receives the module.</li>
  <li><strong>Cuts and metalwork:</strong> the metalworker opens doors, windows and openings, reinforcing the structure — the technical heart of the build.</li>
  <li><strong>Glazing:</strong> the large openings that bring in light and transform the space.</li>
  <li><strong>Installations:</strong> electrical and plumbing built into the design.</li>
  <li><strong>Insulation and cladding:</strong> the decisive stage — rock/PET wool, drywall and a ventilated roof ensure thermal and acoustic comfort.</li>
  <li><strong>Finishing:</strong> floors, paint and, why not, a rooftop with a view.</li>
</ul>

${h.fig(2, { legenda: 'Modular architecture: combined modules create spaces with personality.' })}

<h2>What this has to do with Villela Stay</h2>
<p>Everything that attracts us to modular construction — efficiency, sustainability, well-thought-out spaces full of character — is what we pursue in every stay. Brasília was born from a bold bet on architecture; it makes sense that, around here, we stay curious about what comes next. If you're interested in projects like this too — to live in, to invest or to build — talk to us. We love a good conversation about spaces.</p>
`,
    },
    es: {
      titulo: 'Construcción modular con contenedores: cómo funciona y por qué encanta | Villela Stay',
      descricao: 'Casas y espacios hechos de contenedores marítimos: ventajas, etapas de la obra, aislamiento térmico y acústico, y por qué la construcción modular se volvió tendencia.',
      h1: 'La casa que llega lista en camión',
      dek: 'Rápida, sostenible y sorprendentemente sofisticada: la construcción modular con contenedores marítimos salió del nicho y se volvió arquitectura de deseo. Entiende cómo funciona — y por qué nos interesa tanto.',
      casasTitulo: 'La misma obsesión por los buenos espacios',
      casasTexto: 'Lo que nos atrae de la construcción modular es lo que nos mueve en los alojamientos: espacios bien pensados, eficientes y llenos de personalidad. Conoce las casas de Villela Stay — y habla con nosotros si quieres intercambiar ideas sobre proyectos.',
      isca: { titulo: 'Checklist: pensando en una casa contenedor (PDF)', texto: 'El paso a paso, los cuidados que nadie cuenta (aislamiento, herrería, plazos) y qué evaluar antes de empezar un proyecto modular. Descárgalo ahora.', botao: 'Quiero el checklist' },
      faq: [
        { q: '¿Cuánto tarda una construcción con contenedores?', a: 'Mucho menos que la obra convencional. Como buena parte del trabajo (estructura, cortes, instalaciones, revestimientos) se hace en paralelo y en un ambiente controlado, un proyecto residencial en contenedores puede estar listo en semanas a pocos meses, frente a muchos meses o años de una obra tradicional. El plazo final depende del tamaño y del acabado.' },
        { q: '¿Una casa de contenedor es calurosa?', a: 'Sin tratamiento, sí — el acero conduce mucho calor. Por eso el aislamiento térmico es la etapa más importante: lana de roca o de PET, techo ventilado, drywall y buena orientación solar convierten el contenedor en un ambiente confortable, incluso en un clima caluroso como el de Brasília. Bien hecho, queda tan agradable como cualquier casa de mampostería.' },
        { q: '¿La construcción modular es más barata?', a: 'Suele ser más económica y, sobre todo, más previsible: menos desperdicio, menos tiempo de obra y menos sorpresas de presupuesto. El costo final varía según acabado, instalaciones y aislamiento — un proyecto sofisticado puede acercarse a la mampostería de alto nivel, pero con plazo y sostenibilidad a favor.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Imagina una casa que nace en un galpón, viaja en camión y se monta en el terreno en cuestión de días. No es futurismo — es la construcción modular con contenedores marítimos, una de las ideas más elegantes de la arquitectura contemporánea. Lo que empezó como refugio improvisado se volvió objeto de deseo: casas, oficinas, cafés y posadas que unen rapidez, sostenibilidad y estética industrial chic.</p>

${h.fig(1, { legenda: 'Contenedores marítimos transformados en construcción — estructura lista, montada en el lugar.' })}

<h2>Por qué encantan los contenedores</h2>
<ul class="artigo-lista">
  <li><strong>Velocidad:</strong> la estructura ya existe. Buena parte de la obra ocurre en paralelo, en un ambiente controlado — el plazo se desploma.</li>
  <li><strong>Sostenibilidad:</strong> reutilizar un contenedor es dar nueva vida al acero, con mucho menos escombro y desperdicio que la obra convencional.</li>
  <li><strong>Previsibilidad:</strong> menos sorpresas de presupuesto y cronograma, porque el módulo es estandarizado.</li>
  <li><strong>Estética:</strong> las líneas industriales, las grandes aberturas de vidrio y la flexibilidad de apilar y combinar módulos crean espacios con personalidad.</li>
</ul>

<h2>Cómo cobra vida una casa contenedor</h2>
<p>El encanto está en los detalles — y cada etapa tiene su oficio:</p>
<ul class="artigo-lista">
  <li><strong>Adquisición y transporte:</strong> elegir el contenedor correcto (los de 20 o 40 pies son los más usados) y llevarlo al terreno.</li>
  <li><strong>Cimentación y nivelación:</strong> preparar la base que recibe el módulo.</li>
  <li><strong>Cortes y herrería:</strong> el herrero abre puertas, ventanas y vanos, reforzando la estructura — es el corazón técnico de la obra.</li>
  <li><strong>Vidriería:</strong> las grandes aberturas que traen luz y transforman el ambiente.</li>
  <li><strong>Instalaciones:</strong> eléctrica e hidráulica integradas en el proyecto.</li>
  <li><strong>Aislamiento y revestimiento:</strong> la etapa decisiva — lana de roca/PET, drywall y techo ventilado garantizan confort térmico y acústico.</li>
  <li><strong>Acabado:</strong> pisos, pintura y, por qué no, una azotea con vista.</li>
</ul>

${h.fig(2, { legenda: 'Arquitectura modular: módulos combinados crean espacios con personalidad.' })}

<h2>Qué tiene que ver esto con Villela Stay</h2>
<p>Todo lo que nos atrae de la construcción modular — eficiencia, sostenibilidad, espacios bien pensados y llenos de carácter — es lo que perseguimos en cada alojamiento. Brasília nació de una apuesta audaz por la arquitectura; tiene sentido que, por aquí, sigamos curiosos sobre lo que viene. Si a ti también te interesan proyectos así — para vivir, invertir o emprender — habla con nosotros. Nos encanta una buena conversación sobre espacios.</p>
`,
    },
  },
  'domo-geodesico': {
    en: {
      titulo: 'Geodesic dome: the cupola that becomes a retreat, a home and an events hall | Villela Stay',
      descricao: "What a geodesic dome is, why it captivates architects and hoteliers, how it's built (frequency, connectors, cover) and why it became the dream stay — and an events space for hundreds.",
      h1: 'The geodesic dome: lots of space, little structure, no column in the middle',
      dek: "Light, fast to assemble and hypnotically beautiful, the geodesic dome is one of architecture's most brilliant ideas — and one of the most sought-after stay experiences in the world. Understand how it works, and why it fascinates us.",
      casasTitulo: 'The same passion for spaces that enchant',
      casasTexto: 'What draws us to the dome is what moves every Villela Stay stay: spaces that surprise, embrace and stay in the memory. Discover our houses in Lago Sul — and, if you want to host an event under a dome or bring a project to life, talk to us.',
      isca: { titulo: 'Geodesic dome guide: from calculation to assembly (PDF)', texto: "The geometry without mystery, the frequencies, the connectors and the cover, the step-by-step of the build and the details that decide comfort. The host's guide for anyone who dreams of a dome — to live in, to host or to entertain.", botao: 'I want the guide' },
      faq: [
        { q: 'What is a geodesic dome?', a: 'It\'s a cupola formed by a mesh of triangles that lean on one another, derived from the geometry of the sphere — the same science (geodesy) that measures the surface of the Earth. The triangles distribute the weight across the whole structure, which allows large spans to be covered with no column in the middle, using very little material. It was popularised by the American architect and inventor Buckminster Fuller in the mid-20th century.' },
        { q: 'Can you live — or stay — in a geodesic dome?', a: "Yes, and that's exactly what made it a craze in tourism. With insulation, flooring, installations and a good cover, the dome becomes a surprisingly comfortable and spacious environment. Around the world, transparent domes amid nature are among the most desired stays — sleeping under the stars, with the comfort of a hotel room." },
        { q: 'Why is the dome so strong and economical?', a: 'Because of the geometry. The spherical shape and the mesh of triangles make the structure work together: it supports a lot of weight and strong winds with a fraction of the material of a conventional build. Less material, fast assembly and a very high strength-to-weight ratio — that\'s why the dome appears from greenhouses to emergency shelters and event pavilions.' },
        { q: 'What is the "frequency" of a dome?', a: "It's the level of subdivision of the triangles. The higher the frequency (1V, 2V, 3V…), the more triangles, the closer the cupola gets to a perfect sphere and the larger the span can be — at the cost of more pieces and connectors. The right frequency depends on the size you want to cover and the precision you need." },
        { q: 'Is a dome good for events?', a: 'Very much so. With no internal columns, the dome opens up a free, scenic hall — great for weddings, graduations, launches and gatherings. Depending on the diameter, it holds from a few people to a few hundred guests, with an atmosphere no ordinary tent delivers.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Imagine covering a large space — a room, a winter garden, a hall for hundreds of guests — with no single column in the middle, using a fraction of the material of an ordinary build, and with a shape that catches the eye from any angle. That's the geodesic dome: a mesh of triangles that hold each other up in the form of a cupola. Pure geometry becoming architecture. No wonder it has been captivating everyone from Buckminster Fuller in the 1950s to the most sought-after boutique hotels on Instagram.</p>

${h.fig(1, { legenda: 'The geodesic cupola: triangles leaning on one another, covering large spans with no column in the middle.' })}

<h2>Why the dome captivates</h2>
<ul class="artigo-lista">
  <li><strong>Brilliant structure:</strong> the triangles distribute the weight across the whole mesh. The result is one of the best strength-to-weight ratios in architecture — lots of space, very little material.</li>
  <li><strong>Free span, no columns:</strong> the interior is a single, spacious, scenic environment. Perfect for entertaining, exhibiting, celebrating — or simply breathing.</li>
  <li><strong>Fast to assemble:</strong> standardised pieces (struts and connectors) that fit together — the structure goes up in days, not months.</li>
  <li><strong>Efficient and strong:</strong> the aerodynamic shape handles wind well, and air circulates naturally inside the cupola. Light to transport, firm once assembled.</li>
  <li><strong>Beauty that sells:</strong> the dome is photogenic by nature. As a stay or an events space, it is both the shelter and the attraction.</li>
</ul>

<h2>How a dome takes shape</h2>
<p>Behind the futuristic look there is a clear method — and each stage has its craft:</p>
<ul class="artigo-lista">
  <li><strong>Design and frequency:</strong> you set the diameter and the <em>frequency</em> (1V, 2V, 3V…), that is, how much the mesh is subdivided. More frequency, more triangles, closer to the sphere — and the larger the possible span.</li>
  <li><strong>Calculating the pieces:</strong> the geometry determines the lengths of the struts and the angles of the connectors. This is where precision matters: wrong piece, crooked dome.</li>
  <li><strong>Connectors and struts:</strong> the hubs and bars form the skeleton. Wood, steel or tube — each material calls for a type of joint.</li>
  <li><strong>Foundation and porch:</strong> the base that receives the cupola and the entrance that integrates it with the land.</li>
  <li><strong>Cover:</strong> technical canvas, polycarbonate or panels — the "skin" that closes the dome, from translucent glamping to a fully sealed hall.</li>
  <li><strong>Skylight and openings:</strong> the opening at the top to ventilate and light, plus windows and doors that bring comfort and a view.</li>
  <li><strong>Finishing:</strong> floor, insulation and the final touch that turns the structure into a welcoming space.</li>
</ul>

${h.fig(2, { legenda: "From shelter to urban landmark: the cupola spans great distances with lightness — here, Buckminster Fuller's iconic Montreal Biosphere." })}

<h2>From glamping to the grand event</h2>
<p>The dome has a dual calling. On a small scale, it becomes the <strong>dream stay</strong>: a translucent suite amid the green, to sleep under the stars with the comfort of a good room — one of the most sought-after experiences in nature tourism. On a large scale, it becomes an <strong>events hall</strong>: with no internal columns, it opens space for weddings, graduations and gatherings with an atmosphere no ordinary tent offers, holding from dozens to hundreds of guests depending on the diameter.</p>

<h2>What this has to do with Villela Stay</h2>
<p>Brasília was born from a bold bet on architecture — cupolas, curves and geometry that became the symbol of an entire city. It makes perfect sense that, around here, we remain in love with structures that combine ingenuity and beauty. The geodesic dome is exactly that: form and function in the same gesture. If you dream of <strong>hosting an event under a dome</strong>, staying in one, or bringing a <strong>project to life</strong> — to live in, to invest or to build — <a href="${h.wa('Hi! I came from the geodesic dome article on the Villela Stay website and would like to talk about a dome project/event.')}">talk to us</a>. We love a good conversation about spaces that enchant.</p>
`,
    },
    es: {
      titulo: 'Domo geodésico: la cúpula que se vuelve refugio, casa y salón de eventos | Villela Stay',
      descricao: 'Qué es un domo geodésico, por qué encanta a arquitectos y hoteleros, cómo se construye (frecuencia, conectores, cubierta) y por qué se volvió el alojamiento de los sueños — y un espacio de eventos para cientos.',
      h1: 'El domo geodésico: mucho espacio, poca estructura, ninguna columna en el medio',
      dek: 'Ligero, rápido de montar y de una belleza hipnótica, el domo geodésico es una de las ideas más geniales de la arquitectura — y una de las experiencias de alojamiento más buscadas del mundo. Entiende cómo funciona, y por qué nos fascina.',
      casasTitulo: 'La misma pasión por espacios que encantan',
      casasTexto: 'Lo que nos atrae del domo es lo que mueve cada alojamiento de Villela Stay: espacios que sorprenden, abrazan y quedan en la memoria. Conoce nuestras casas en el Lago Sul — y, si quieres realizar un evento bajo un domo o sacar un proyecto del papel, habla con nosotros.',
      isca: { titulo: 'Guía del domo geodésico: del cálculo al montaje (PDF)', texto: 'La geometría sin misterio, las frecuencias, los conectores y la cubierta, el paso a paso de la obra y los cuidados que deciden el confort. La guía del anfitrión para quien sueña con un domo — para vivir, alojar o recibir.', botao: 'Quiero la guía' },
      faq: [
        { q: '¿Qué es un domo geodésico?', a: 'Es una cúpula formada por una malla de triángulos que se apoyan unos en otros, derivada de la geometría de la esfera — la misma ciencia (geodesia) que mide la superficie de la Tierra. Los triángulos distribuyen el peso por toda la estructura, lo que permite cubrir grandes vanos sin ninguna columna en el medio, con muy poco material. Fue popularizado por el arquitecto e inventor estadounidense Buckminster Fuller a mediados del siglo XX.' },
        { q: '¿Se puede vivir — o alojarse — en un domo geodésico?', a: 'Sí, y es justamente lo que lo volvió furor en el turismo. Con aislamiento, piso, instalaciones y una buena cubierta, el domo se vuelve un ambiente sorprendentemente confortable y amplio. En todo el mundo, los domos transparentes en medio de la naturaleza están entre los alojamientos más deseados — dormir viendo las estrellas, con el confort de una habitación de hotel.' },
        { q: '¿Por qué el domo es tan resistente y económico?', a: 'Por la geometría. La forma esférica y la malla de triángulos hacen que la estructura trabaje en conjunto: soporta mucho peso y vientos fuertes con una fracción del material de una construcción convencional. Menos material, montaje rápido y altísima relación resistencia/peso — por eso el domo aparece desde invernaderos hasta refugios de emergencia y pabellones de eventos.' },
        { q: '¿Qué es la "frecuencia" de un domo?', a: 'Es el nivel de subdivisión de los triángulos. Cuanto mayor la frecuencia (1V, 2V, 3V…), más triángulos, más se acerca la cúpula a una esfera perfecta y mayor puede ser el vano — a costa de más piezas y conectores. La frecuencia correcta depende del tamaño que quieras cubrir y de la precisión deseada.' },
        { q: '¿El domo sirve para eventos?', a: 'Sirve muy bien. Sin columnas internas, el domo abre un salón libre y escénico — ideal para bodas, graduaciones, lanzamientos y celebraciones. Según el diámetro, acomoda desde pocas personas hasta algunos cientos de invitados, con una atmósfera que ninguna carpa común entrega.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Imagina cubrir un gran espacio — una sala, un jardín de invierno, un salón para cientos de invitados — sin una sola columna en el medio, gastando una fracción del material de una obra común, y con una forma que atrapa la mirada desde cualquier ángulo. Eso es el domo geodésico: una malla de triángulos que se sostienen mutuamente en forma de cúpula. Pura geometría volviéndose arquitectura. No por casualidad, viene encantando desde Buckminster Fuller, en los años 1950, hasta los hoteles boutique más disputados de Instagram.</p>

${h.fig(1, { legenda: 'La cúpula geodésica: triángulos que se apoyan unos en otros y cubren grandes vanos sin columna en el medio.' })}

<h2>Por qué encanta el domo</h2>
<ul class="artigo-lista">
  <li><strong>Estructura genial:</strong> los triángulos distribuyen el peso por toda la malla. El resultado es una de las mejores relaciones resistencia/peso de la arquitectura — mucho espacio, poquísimo material.</li>
  <li><strong>Vano libre, sin columnas:</strong> el interior es un único ambiente amplio y escénico. Perfecto para recibir, exponer, celebrar — o simplemente respirar.</li>
  <li><strong>Rápido de montar:</strong> piezas estandarizadas (barras y conectores) que encajan — la estructura se levanta en días, no en meses.</li>
  <li><strong>Eficiente y resistente:</strong> la forma aerodinámica enfrenta bien el viento, y el aire circula con naturalidad dentro de la cúpula. Ligero para transportar, firme una vez montado.</li>
  <li><strong>Belleza que vende:</strong> el domo es fotogénico por naturaleza. Como alojamiento o espacio de eventos, es a la vez el refugio y la atracción.</li>
</ul>

<h2>Cómo cobra forma un domo</h2>
<p>Detrás de la apariencia futurista hay un método claro — y cada etapa tiene su oficio:</p>
<ul class="artigo-lista">
  <li><strong>Proyecto y frecuencia:</strong> se define el diámetro y la <em>frecuencia</em> (1V, 2V, 3V…), es decir, cuánto se subdivide la malla. Más frecuencia, más triángulos, más cerca de la esfera — y mayor el vano posible.</li>
  <li><strong>Cálculo de las piezas:</strong> la geometría determina las longitudes de las barras y los ángulos de los conectores. Aquí importa la precisión: pieza errada, domo torcido.</li>
  <li><strong>Conectores y barras:</strong> los nudos (hubs) y las barras forman el esqueleto. Madera, acero o tubo — cada material pide un tipo de encaje.</li>
  <li><strong>Cimentación y pórtico:</strong> la base que recibe la cúpula y la entrada que la integra al terreno.</li>
  <li><strong>Cubierta:</strong> lona técnica, policarbonato o paneles — la "piel" que cierra el domo, del glamping translúcido al salón totalmente sellado.</li>
  <li><strong>Linternilla y aberturas:</strong> la abertura en el tope para ventilar e iluminar, más ventanas y puertas que dan confort y vista.</li>
  <li><strong>Acabado:</strong> piso, aislamiento y el toque final que transforma la estructura en un ambiente acogedor.</li>
</ul>

${h.fig(2, { legenda: 'Del refugio al hito urbano: la cúpula vence grandes vanos con ligereza — aquí, la icónica Biosfera de Montreal, de Buckminster Fuller.' })}

<h2>Del glamping al gran evento</h2>
<p>El domo tiene doble vocación. En pequeño tamaño, se vuelve el <strong>alojamiento de los sueños</strong>: una suite translúcida en medio del verde, para dormir bajo las estrellas con el confort de una buena habitación — una de las experiencias más buscadas en el turismo de naturaleza. En gran tamaño, se vuelve <strong>salón de eventos</strong>: sin columnas internas, abre espacio para bodas, graduaciones y celebraciones con una atmósfera que ninguna carpa común ofrece, acomodando de decenas a cientos de invitados según el diámetro.</p>

<h2>Qué tiene que ver esto con Villela Stay</h2>
<p>Brasília nació de una apuesta audaz por la arquitectura — cúpulas, curvas y geometría que se volvieron símbolo de una ciudad entera. Tiene todo el sentido que, por aquí, sigamos enamorados de estructuras que unen ingenio y belleza. El domo geodésico es exactamente eso: forma y función en el mismo gesto. Si sueñas con <strong>realizar un evento bajo un domo</strong>, alojarte en uno, o sacar un <strong>proyecto del papel</strong> — para vivir, invertir o emprender — <a href="${h.wa('¡Hola! Vengo del artículo sobre el domo geodésico en el sitio de Villela Stay y quiero hablar sobre un proyecto/evento con domo.')}">habla con nosotros</a>. Nos encanta una buena conversación sobre espacios que encantan.</p>
`,
    },
  },
  'hospedagem-profissional': {
    en: {
      titulo: 'Professional hosting: your property earning more, without the hassle | Villela Stay',
      descricao: 'Full vacation-rental management in Lago Sul and Brasília: inspection, styling, photography, listings, smart pricing, cleaning, maintenance and guest service. You earn more, we handle everything.',
      h1: 'Your property can earn much more — and be far less work',
      dek: 'Let Villela Stay handle everything: from professional photography to smart pricing, from cleaning to guest service. You follow the results in real time and get paid — we do the rest.',
      casasTitulo: 'The standard we deliver',
      casasTexto: 'These are some of the houses we manage in Lago Sul — the same care with styling, photography, maintenance and service that we would give your property. It is this level of hospitality that turns a property into an award-winning source of income.',
      isca: { titulo: "How much can your property earn? Owner's guide (PDF)", texto: "What to assess before putting your property up for vacation rental, how to estimate profitability, what separates a listing that fills up from one that sits empty — and everything professional management does for you. The host's guide for owners.", botao: "I want the owner's guide" },
      faq: [
        { q: 'How does the management work — what do you do for me?', a: 'Everything that stands between you and the work and the guest. We inspect and prepare the property, do styling and landscaping, professional photography, create and optimise the listings on the platforms, smart pricing, guest service from first contact to check-out, cleaning and linen changes, maintenance and restocking. You just follow the results and get paid.' },
        { q: 'Can I use my own property whenever I want?', a: "Yes, always. You block the dates you want to use — for you, for the family or for whoever you choose — with full flexibility. The property remains yours; we only take care of it when it's available for guests." },
        { q: 'Will I be able to track what happens with my property?', a: 'Yes. You have full transparency: you follow bookings, occupancy and finances in real time, at any moment. No black box — you see exactly what comes in, what goes out and how your property is performing.' },
        { q: 'What about cleaning and maintenance between stays?', a: 'Our team does a full clean and linen change after each departure, to hotel standard, and checks the property at each stay to fix any issue before the next guest. We also track and restock the consumables (amenities, utensils, whatever is missing).' },
        { q: 'How do you avoid overbooking across platforms?', a: "We work with a unified calendar integrated with the main platforms (Airbnb, Booking, Decolar, Vrbo, Google and direct bookings). Everything syncs in one place — it maximises the property's exposure and eliminates the risk of booking the same date twice." },
        { q: 'Is Villela Stay a real estate agency?', a: "No. We are a hosting and vacation-rental management operation — the trading name of the governance of lawyer Augusto Villela and his wife, Renata Freitas. We don't sell or rent out properties like an agency: we help owners turn their properties into a professional source of income, with award-winning hospitality." },
      ],
      corpo: (h) => `
<p class="artigo-lead">You have a property — a house, a flat, a suite — and the feeling that it could earn more. Really earn. The thing is, living off vacation rentals feels like a second job: photos, listings, messages at all hours, pricing, cleaning, check-in, maintenance, reviews. That's exactly the work Villela Stay takes on for you. You keep the income and the peace of mind; we keep the operation.</p>

${h.fig(1, { legenda: "Lago Sul, Brasília: the capital's most prestigious address — and where we turn properties into award-winning stays." })}

<h2>Why hand the management to Villela Stay</h2>
<ul class="artigo-lista">
  <li><strong>Maximum profitability:</strong> smart pricing and optimised occupancy so your property earns the most possible, all year round.</li>
  <li><strong>Minimum work for you:</strong> we take care of everything, from preparation to check-out. You relax while the earnings come in.</li>
  <li><strong>Delighted guests:</strong> hotel-level service generates 5-star reviews — and good reviews attract more bookings, in a self-reinforcing cycle.</li>
  <li><strong>Full transparency:</strong> bookings, occupancy and finances in real time, at any moment. You always know what's happening.</li>
  <li><strong>Real flexibility:</strong> block the dates you want to use your property. It stays yours — always.</li>
</ul>

<h2>What we do for you</h2>
<ul class="artigo-lista">
  <li><strong>Inspection and preparation:</strong> we assess the property and get it ready to welcome guests — to the standard guests reward.</li>
  <li><strong>Styling and landscaping:</strong> we create a welcoming, photogenic setting, designed for the right audience.</li>
  <li><strong>Professional photography:</strong> the first impression is the photo. We capture the best of your property so it stands out on the platforms.</li>
  <li><strong>Listings and pricing:</strong> we create and optimise the listings, with dynamic pricing that follows demand — competitive on slow dates, premium on strong ones.</li>
  <li><strong>Cleaning and maintenance:</strong> a full clean and linen change for every stay, plus the preventive maintenance that keeps the property impeccable.</li>
  <li><strong>Guest service:</strong> we reply fast, from first contact to post-stay, ensuring a memorable experience — and the review that comes with it.</li>
</ul>

${h.fig(2, { legenda: 'Pontão do Lago Sul: life by the Paranoá, minutes from the properties we manage.' })}

<h2>Technology and people, to the right standard</h2>
<p>Behind the hospitality there is method. A unified calendar integrates the main platforms — Airbnb, Booking, Decolar, Vrbo, Google and direct bookings — to maximise your property's exposure and eliminate the risk of overbooking. Add a team specialised in welcoming people well, and the result is what matters: more bookings, better guests and reviews that turn into even more bookings.</p>

<h2>Who looks after your property</h2>
<p>Villela Stay is the hosting and governance operation of lawyer <strong>Augusto Villela</strong> and his wife, <strong>Renata Freitas</strong> — award-winning hosts (Superhosts), with houses, flats and suites in Lago Sul, Brasília's most prestigious address. We are not a real estate agency or a distant app: we are the ones who serve, decide and respond. We treat every property under our management as if it were our own — because our reputation is in every stay.</p>

<p>It's time your property earned what it deserves, without it becoming a problem for you. <a href="${h.wa('Hi! I came from the Professional Hosting article on the Villela Stay website and would like to know how you can manage my property.')}">Talk to us</a> and find out how much your property can earn.</p>
`,
    },
    es: {
      titulo: 'Hospedaje profesional: tu inmueble rindiendo más, sin dolores de cabeza | Villela Stay',
      descricao: 'Gestión completa de alquiler por temporada en el Lago Sul y en Brasília: inspección, decoración, fotografía, anuncios, precios inteligentes, limpieza, mantenimiento y atención al huésped. Tú ganas más, nosotros nos encargamos de todo.',
      h1: 'Tu inmueble puede rendir mucho más — y darte mucho menos trabajo',
      dek: 'Deja que Villela Stay se encargue de todo: de la fotografía profesional a los precios inteligentes, de la limpieza a la atención al huésped. Tú sigues los resultados en tiempo real y cobras — nosotros hacemos el resto.',
      casasTitulo: 'El estándar que entregamos',
      casasTexto: 'Estas son algunas de las casas que administramos en el Lago Sul — el mismo cuidado con la decoración, la fotografía, el mantenimiento y la atención que dedicaríamos a tu inmueble. Es este nivel de hospitalidad lo que transforma una propiedad en una fuente de ingresos premiada.',
      isca: { titulo: '¿Cuánto puede rendir tu inmueble? Guía del propietario (PDF)', texto: 'Qué evaluar antes de poner tu inmueble en alquiler por temporada, cómo estimar la rentabilidad, qué separa un anuncio que se llena de uno que no — y todo lo que una gestión profesional hace por ti. La guía del anfitrión para propietarios.', botao: 'Quiero la guía del propietario' },
      faq: [
        { q: '¿Cómo funciona la gestión — qué hacen por mí?', a: 'Todo lo que te separa del trabajo y del huésped. Hacemos la inspección y la preparación del inmueble, decoración y paisajismo, fotografía profesional, creación y optimización de los anuncios en las plataformas, precios inteligentes, atención al huésped del primer contacto al check-out, limpieza y cambio de ropa de cama, mantenimiento y reposición. Tú solo sigues los resultados y cobras.' },
        { q: '¿Puedo usar mi propio inmueble cuando quiera?', a: 'Sí, siempre. Bloqueas las fechas que quieras usar — para ti, para la familia o para quien indiques — con total flexibilidad. El inmueble sigue siendo tuyo; nosotros solo lo cuidamos cuando está disponible para huéspedes.' },
        { q: '¿Podré seguir lo que pasa con mi inmueble?', a: 'Sí. Tienes transparencia total: sigues reservas, ocupación y finanzas en tiempo real, en cualquier momento. Nada de caja negra — ves exactamente lo que entra, lo que sale y cómo está rindiendo tu inmueble.' },
        { q: '¿Cómo es la limpieza y el mantenimiento entre estancias?', a: 'Nuestro equipo hace la limpieza completa y el cambio de ropa de cama tras cada salida, con estándar de hotel, y verifica el inmueble en cada estancia para corregir cualquier problema antes del próximo huésped. También controlamos y reponemos los consumibles (amenities, utensilios, lo que falte).' },
        { q: '¿Cómo evitan el overbooking entre plataformas?', a: 'Trabajamos con un calendario unificado integrado a las principales plataformas (Airbnb, Booking, Decolar, Vrbo, Google y reservas directas). Todo se sincroniza en un solo lugar — maximiza la exposición del inmueble y elimina el riesgo de reservar la misma fecha dos veces.' },
        { q: '¿Villela Stay es una inmobiliaria?', a: 'No. Somos una operación de hospedaje y gestión de alquiler por temporada — nombre comercial de la gobernanza del abogado Augusto Villela y su esposa, Renata Freitas. No vendemos ni alquilamos inmuebles como una inmobiliaria: ayudamos a los propietarios a transformar sus inmuebles en una fuente de ingresos profesional, con hospitalidad premiada.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Tienes un inmueble — una casa, un flat, una suite — y la sensación de que podría rendir más. Rendir de verdad. Solo que vivir del alquiler por temporada parece un segundo empleo: fotos, anuncios, mensajes a cualquier hora, precio, limpieza, check-in, mantenimiento, reseñas. Es exactamente ese trabajo el que Villela Stay asume por ti. Tú te quedas con la renta y la tranquilidad; la operación se queda con nosotros.</p>

${h.fig(1, { legenda: 'Lago Sul, Brasília: la dirección más exclusiva de la capital — y donde transformamos inmuebles en alojamientos premiados.' })}

<h2>Por qué entregar la gestión a Villela Stay</h2>
<ul class="artigo-lista">
  <li><strong>Rentabilidad máxima:</strong> precios inteligentes y ocupación optimizada para que tu inmueble rinda lo mejor posible, todo el año.</li>
  <li><strong>Trabajo mínimo para ti:</strong> nos encargamos de todo, de la preparación al check-out. Tú te relajas mientras entran las ganancias.</li>
  <li><strong>Huéspedes encantados:</strong> la atención de nivel hotel genera reseñas de 5 estrellas — y una buena reseña atrae más reservas, en un ciclo que se retroalimenta.</li>
  <li><strong>Transparencia total:</strong> reservas, ocupación y finanzas en tiempo real, en cualquier momento. Siempre sabes lo que está pasando.</li>
  <li><strong>Flexibilidad real:</strong> bloquea las fechas en que quieras usar tu inmueble. Sigue siendo tuyo — siempre.</li>
</ul>

<h2>Lo que hacemos por ti</h2>
<ul class="artigo-lista">
  <li><strong>Inspección y preparación:</strong> evaluamos el inmueble y lo dejamos listo para recibir — con el estándar que los huéspedes premian.</li>
  <li><strong>Decoración y paisajismo:</strong> creamos un ambiente acogedor y fotogénico, pensado para el público correcto.</li>
  <li><strong>Fotografía profesional:</strong> la primera impresión es la foto. Capturamos lo mejor de tu inmueble para que destaque en las plataformas.</li>
  <li><strong>Anuncios y precios:</strong> creamos y optimizamos los anuncios, con precio dinámico que acompaña la demanda — competitivo en fechas flojas, valorizado en las fuertes.</li>
  <li><strong>Limpieza y mantenimiento:</strong> limpieza completa y cambio de ropa de cama en cada estancia, además del mantenimiento preventivo que mantiene el inmueble impecable.</li>
  <li><strong>Atención al huésped:</strong> respondemos rápido, del primer contacto al post-estancia, garantizando una experiencia memorable — y la reseña que viene de ella.</li>
</ul>

${h.fig(2, { legenda: 'Pontão do Lago Sul: la vida a la orilla del Paranoá, a pocos minutos de los inmuebles que administramos.' })}

<h2>Tecnología y gente, con el estándar correcto</h2>
<p>Detrás de la hospitalidad hay método. Un calendario unificado integra las principales plataformas — Airbnb, Booking, Decolar, Vrbo, Google y reservas directas — para maximizar la exposición de tu inmueble y eliminar el riesgo de overbooking. Suma a eso un equipo especializado en recibir bien, y el resultado es lo que importa: más reservas, mejores huéspedes y reseñas que se convierten en aún más reservas.</p>

<h2>Quién cuida de tu inmueble</h2>
<p>Villela Stay es la operación de hospedaje y gobernanza del abogado <strong>Augusto Villela</strong> y su esposa, <strong>Renata Freitas</strong> — anfitriones premiados (Superhosts), con casas, flats y suites en el Lago Sul, la dirección más exclusiva de Brasília. No somos una inmobiliaria ni una app distante: somos quienes atienden, deciden y responden. Tratamos cada inmueble bajo nuestra gestión como si fuera nuestro — porque nuestra reputación está en cada estancia.</p>

<p>Llegó la hora de que tu inmueble facture lo que merece, sin que eso se vuelva un problema tuyo. <a href="${h.wa('¡Hola! Vengo del artículo de Hospedaje Profesional en el sitio de Villela Stay y quiero saber cómo pueden administrar mi inmueble.')}">Habla con nosotros</a> y descubre cuánto puede rendir tu propiedad.</p>
`,
    },
  },
  'ia-nao-substitui-voce': {
    en: {
      titulo: "AI doesn't replace you: it multiplies whoever learns to use it — and retires whoever doesn't | Villela Stay",
      descricao: 'Why studying artificial intelligence gives a lawyer three qualifications at once — technology, legal practice and management —, tears down the barrier that separated the small firm from the large one, and turns whoever learns into something greater than the AI and the professional would be apart.',
      h1: "AI doesn't replace you. It multiplies whoever learns to use it — and retires whoever doesn't",
      dek: 'On several fronts of legal work the machine is already better than a human being. Refusing it is not prudence: it is defeat by absence. Mastering it is the only way to add its power to what only a person has.',
      faq: [
        { q: 'Will artificial intelligence replace the lawyer?', a: 'No — but it does replace the advantage of whoever refuses to use it. AI is better than a human being at sweeping, comparing, staying consistent and handling volume, and it remains incapable of what belongs to a person: answering for the mistake with a name and a bar registration, holding a reputation built over years, reading the human context of a case and deciding. What the market is separating is not lawyer from machine: it is the lawyer who adds the machine from the lawyer who does not.' },
        { q: 'Why does studying AI improve legal practice itself, not just productivity?', a: 'Because using AI well forces you to put into words what used to be intuition. To steer the tool properly, a lawyer has to say what they want, in what order, under which criteria, to what standard and avoiding which risk — that is, to formalise their own method. Whoever sets up an AI to review contracts usually discovers, along the way, what their contract review method actually is. Deepening the craft is not a side effect: it is how the thing works.' },
        { q: 'Can a small firm compete with a large one using AI?', a: 'It can, and that is the most relevant economic shift. The distance between the large and the small firm was never mainly about legal talent: it was installed capacity — a team to absorb volume, a second pair of eyes, administration, IT, marketing, management. Fixed cost that only scale pays for. AI converts fixed structural cost into individual competence: what required hiring now requires learning. With a lower cost and the same standard of delivery, the small firm can beat the large one in profit per professional.' },
        { q: 'What are the risks of using AI in legal work without studying it?', a: 'They are real and well documented: hallucinated precedents and citations that do not exist, decontextualised reading of a legal argument, overconfidence in an answer that is plausible but wrong, and improper exposure of client data. AI is unbeatable at volume and fragile at legal judgement. That is precisely why study decides the outcome: if it were infallible, you would just press the button and learning would make no difference. The trained professional extracts the gain and steers around the trap; the untrained one chooses between falling behind by not using it and getting burned by using it badly.' },
        { q: 'What can AI not do for a lawyer?', a: 'Everything that is strictly personal: taking responsibility for the mistake with a name and personal assets, being the person a client has trusted for fifteen years, holding a reputation before the judge and the opposing party, sensing that a case is not about money but about resentment, having the courage to decide and sign, and looking a client in the eye to say the truth they do not want to hear. None of that can be generated or downloaded — and it is exactly what gets added to the power of the machine.' },
        { q: 'Where should you start studying AI applied to law?', a: 'With real use, on tasks you already master and can check — that is where mistakes surface early and teach. Then with organising your own method, which is what separates occasional use from permanent gain. The Claude AI na Prática Jurídica series is published free on this site, in 52 chapters, and the book and the course go deeper into the same path with the complete workflows. All of this material is in Portuguese.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">There is a question that has stopped making sense: <em>will artificial intelligence replace the lawyer?</em> The useful question is another one, and it is uncomfortable — <strong>how long before the colleague who learned to use it delivers in two days what takes you two weeks?</strong> This piece is about why studying AI is not learning one more tool, but acquiring a multiplier that applies to everything you already know how to do.</p>

${h.fig(1, { legenda: 'A single lawyer, the structure of an entire firm: what used to require a team now fits on one desk.' })}

<h2>1. AI is not a tool for one field — it is a general-purpose technology</h2>
<p>Legal software is for practising law. An ERP is for running a business. Every traditional tool is born glued to a single use. AI is not: it is a layer that attaches to any activity made of text, reasoning, analysis, decision and repetition — and legal work is made almost entirely of that.</p>
<p>The consequence is that studying AI does not add one more subject to your training. It gives you a multiplier that applies to everything you already know. Someone who studies tax law gets better at tax law. <strong>Someone who studies AI gets better at everything they do.</strong></p>

<h2>2. To be good at AI, you are forced to spell out what you know</h2>
<p>Here is the mechanism almost nobody notices. An experienced lawyer works largely on accumulated intuition: they can tell &ldquo;at a glance&rdquo; whether a clause is risky, where the other side&rsquo;s brief is weak, which argument that particular court tends to accept. That knowledge is tacit — it works, but it has never been put into words.</p>
<p>To use AI with quality, it <em>has to be</em> put into words. You have to say what you want, in what order, under which criteria, to what standard of quality, avoiding which risk. In other words: using AI well forces the lawyer to become a teacher of their own craft — and nobody comes out of that process the same. Whoever sets up an AI to review contracts discovers, along the way, what their contract review method actually is. Often for the first time in their career.</p>
<p>That is why the gain is double and inseparable: <strong>learning to use AI in legal work is, at the same time, a deepening of legal work itself.</strong> It is not a pleasant side effect. It is how the thing works.</p>

<h2>3. Three layers of competence open at once</h2>

<h3>The technical layer — what used to belong to IT</h3>
<p>Automations, integrations, organised knowledge bases, dashboards, small custom systems. Before, any of these required a budget, a vendor, a deadline and dependence: &ldquo;IT will look into it&rdquo;. Today whoever understands AI describes what they need and gets it. It is not that the lawyer becomes a programmer — it is that the language barrier between wanting and getting has fallen. That is autonomy, and autonomy is speed.</p>

<h3>The core layer — practising law better</h3>
<p>Broader research in less time, analysis of volumes no team would read, testing an argument against its counter-argument, simulating the opponent&rsquo;s case, checking coherence, drafts produced from a method that is yours. The professional is not replaced: they are amplified. They are still the one who judges — only now they judge with more material on the table and the heavy lifting already done.</p>

<h3>The management layer — what separated the large from the small</h3>
<p>Deadline control, pricing, cash flow, indicators, client pipeline, quality standardisation, written procedures, marketing, follow-up. None of this is taught in law school, and almost none of it can a small firm afford to buy. With AI, it can build it.</p>

<h2>4. The economic argument: the barrier was never talent</h2>
<p>The distance between the large firm and the small one was never, primarily, about legal talent. There have always been excellent lawyers working alone. The barrier was <strong>installed capacity</strong>: a team to absorb volume, a second pair of eyes for quality control, administration, IT, marketing, management. High fixed cost, which only scale pays for — and scale only reaches those who already have structure. A closed circle, nearly impossible to break into for someone starting out.</p>
<p>AI breaks that circle because it performs an unprecedented conversion: <strong>it turns fixed structural cost into individual competence.</strong> What used to require hiring, training, supervising and paying every month now requires learning. And learning has a decreasing marginal cost: you study once and use it forever, on every case.</p>
<p>In practice, the small firm starts delivering at the standard that was the exclusive preserve of the large one — the same depth of research, the same consistency of documents, the same deadline control, the same client follow-up — without the payroll that sustained that standard. And because the cost is lower, the margin is higher. The small firm does not merely catch up with the large one: in profit per professional, it can overtake it.</p>

<h2>5. Refusing AI is not neutrality — it is defeat by absence</h2>
<p>This has to be said without hedging, because it is the uncomfortable and true part: on several dimensions of legal work, AI is already better than a human being. Not on a few — on several. Speed, obviously. But also breadth of reading, resistance to fatigue, consistency at three in the morning, the ability to compare five hundred contracts without skipping one, to cross-reference an argument against all available case law without forgetting what it read on the previous page. No professional, however brilliant, competes with that. No team competes with that.</p>
<p>Faced with a fact like that, refusing to use it is neither prudence nor loyalty to the craft. It is choosing to compete in the market without part of your capacity. <strong>Whoever refuses to use AI has already lost</strong> — not will lose, has already lost, because the comparison is no longer between them and the machine, it is between them and the colleague who adds the machine. And the one making that comparison is the client, every day, looking at deadline, price and quality.</p>

<h2>6. But there is a caveat — and it is what makes studying indispensable</h2>
<p>Better on several fronts does not mean better on all of them, and the distinction is the core of the value of being prepared. AI is unbeatable at sweeping, comparing, staying consistent and handling volume. It is fragile, and sometimes dangerous, at legal judgement, at weighing a precedent, at reading context and at responsibility — naive use produces well-known disasters, such as citing a precedent that does not exist.</p>
<p>That is precisely why study decides the outcome. <strong>If AI were infallible, learning would make no difference: you would just press the button.</strong> It is because it fails in specific, predictable ways that the trained professional holds an enormous advantage over the untrained one. Whoever studies extracts the gain and steers around the trap. Whoever does not study chooses between falling behind by not using it and getting burned by using it badly.</p>

<h2>7. The sum: what AI will never have, and what happens when the two join</h2>
<p>Here we reach the decisive point. You have things AI does not have and probably never will — not because of a passing technical limitation, but because they are attributes of a person, not of a machine. They are strictly personal:</p>
<ul class="artigo-lista">
  <li><strong>Responsibility</strong> — someone who answers for the mistake, with a name, personal assets and a bar registration.</li>
  <li><strong>Trust built over time</strong> — the client who comes to you because they have known you for fifteen years, not because they compared prices.</li>
  <li><strong>Reputation</strong> before the judge, the prosecutor, the lawyer on the other side.</li>
  <li><strong>A feel for context</strong> — knowing that this case is not about money, it is about resentment; that here a settlement fits better than a ruling.</li>
  <li><strong>The courage</strong> to decide and sign your name to it.</li>
  <li><strong>The experience</strong> of having lived through it before, with those people, in that courthouse.</li>
  <li><strong>The ability</strong> to look the client in the eye and say the truth they do not want to hear.</li>
</ul>
<p>None of that can be generated. None of that can be downloaded. That is you.</p>
<p>And this is exactly where the reasoning closes. AI alone has a ceiling: it is fast and broad, but impersonal, it answers for nothing, it does not know your client, it has no history. You alone have another ceiling: irreplaceable in judgement, but limited in volume, speed and stamina. <strong>Added together, both ceilings fall.</strong></p>
<p>Whoever accepts using it and becomes skilled does not end up &ldquo;almost as good as the AI&rdquo;. They end up above it — because they add to the power of the machine what the machine cannot reach, and add to their own experience what no human experience reaches alone. It is the only configuration that beats both parts in isolation. Those are the superpowers: not AI in place of the lawyer, but AI coupled to a lawyer who knows how to steer it.</p>

<h2>8. The three destinies</h2>
<p>The legal market is splitting into three groups, and the only difference between them is study:</p>
<ul class="artigo-lista">
  <li><strong>Those who refuse.</strong> They lose by absence, competing with half the capacity against someone who has twice as much.</li>
  <li><strong>Those who use it without learning.</strong> They gain speed and lose reliability — and one invented precedent in a brief costs more than all the time saved.</li>
  <li><strong>Those who learn to use it.</strong> They add. They deliver faster, with more depth, at a lower cost, running their own firm with the rigour that used to require a team — and on top of that they bring what no machine brings: presence, responsibility and trust.</li>
</ul>

<div class="artigo-nota">
  <p><strong>In short.</strong> AI is general by nature, so whoever studies it gains three qualifications at once — technology, legal practice and management. Using it well requires organising your own knowledge, so learning AI deepens the practice of law. It converts fixed structural cost into individual competence, so it tears down the barrier that separated the small firm from the large one. And since it is already better than a human being on several fronts, refusing it is certain loss — while mastering it is the only way to add the power of the machine to what only a person has, and produce a result greater than the AI and the lawyer would be capable of separately.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">Follow the complete path</span>
  <h2>Claude AI na Prática Jurídica</h2>
  <p>All 52 chapters of the series are published free on this site — from the first responsible use to the workflows that sustain an entire firm. The book and the online course go deeper into the same path, with the scripts ready to apply. All of this material is in Portuguese.</p>
  <p class="artigo-cta-links">
    <a href="/claude-juridico/">Read the full series (free)</a>
    <a href="https://livros.villelastay.com.br/livros/claude-ai-na-pratica-juridica?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=ia-nao-substitui-voce" target="_blank" rel="noopener">See the book</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=ia-nao-substitui-voce" target="_blank" rel="noopener">See the online course</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p>Written by <strong>Augusto Villela</strong>, lawyer (Brazilian Bar, OAB/DF 12.003) and author of the <em>Claude AI na Prática</em> series. It reflects the experience of applying artificial intelligence to the routine of a law firm and of a hospitality operation — it is not legal advice nor a recommendation for a specific case.</p>
</div>
`,
    },
    es: {
      titulo: 'La IA no te sustituye: multiplica a quien sabe usarla — y jubila a quien no sabe | Villela Stay',
      descricao: 'Por qué estudiar inteligencia artificial le da al abogado tres formaciones a la vez — tecnología, abogacía y gestión —, derriba la barrera que separaba al despacho pequeño del grande y convierte a quien aprende en algo mayor de lo que la IA y el profesional serían por separado.',
      h1: 'La IA no te sustituye. Multiplica a quien sabe usarla — y jubila a quien no sabe',
      dek: 'En varios frentes del trabajo jurídico la máquina ya es superior al ser humano. Rechazarla no es prudencia: es derrota por ausencia. Dominarla es la única forma de sumar su potencia a lo que solo una persona tiene.',
      faq: [
        { q: '¿La inteligencia artificial va a sustituir al abogado?', a: 'No, pero sí sustituye la ventaja de quien no la usa. La IA es superior al ser humano en rastreo, comparación, consistencia y volumen — y sigue siendo incapaz de lo que es propio de la persona: responder por el error con nombre y colegiación, tener una reputación construida, leer el contexto humano de un caso y decidir. Lo que el mercado está separando no es abogado de máquina: es el abogado que suma la máquina del abogado que no la suma.' },
        { q: '¿Por qué estudiar IA mejora la abogacía en sí, y no solo la productividad?', a: 'Porque usar IA con calidad obliga a verbalizar lo que antes era intuición. Para orientar bien la herramienta, el abogado necesita decir qué quiere, en qué orden, bajo qué criterio, con qué estándar y evitando qué riesgo — es decir, necesita formalizar su propio método. Quien configura una IA para revisar contratos suele descubrir, en el proceso, cuál es de hecho su método de revisión de contratos. Profundizar en el oficio no es un efecto colateral: es el funcionamiento normal de la cosa.' },
        { q: '¿Un despacho pequeño puede competir con uno grande usando IA?', a: 'Puede, y ese es el cambio económico más relevante. La distancia entre el grande y el pequeño nunca fue principalmente de talento jurídico: era de capacidad instalada — equipo para absorber volumen, un segundo par de ojos, administración, informática, marketing, gestión. Costo fijo que solo la escala paga. La IA convierte costo fijo de estructura en competencia individual: lo que exigía contratar ahora exige aprender. Con un costo menor y el mismo estándar de entrega, el margen por profesional del pequeño puede superar al del grande.' },
        { q: '¿Cuáles son los riesgos de usar IA en la abogacía sin estudiar?', a: 'Son reales y conocidos: alucinación de precedentes y citas inexistentes, lectura descontextualizada de una tesis, exceso de confianza en una respuesta plausible pero errónea, y exposición indebida de datos del cliente. La IA es imbatible en volumen y frágil en juicio jurídico. Justamente por eso el estudio decide el resultado: si fuera infalible, bastaría con apretar el botón y aprender no haría diferencia. El profesional formado extrae la ganancia y esquiva la trampa; el no formado elige entre quedarse atrás por no usarla o quemarse por usarla mal.' },
        { q: '¿Qué no puede hacer la IA por un abogado?', a: 'Todo lo que es personalísimo: asumir la responsabilidad por el error con nombre y patrimonio, ser la persona en quien el cliente confía desde hace quince años, tener reputación ante el juez y la parte contraria, percibir que ese caso no es sobre dinero sino sobre rencor, tener el coraje de decidir y firmar, y mirar al cliente a los ojos para decirle la verdad que no quiere oír. Nada de eso es generable ni descargable — y es exactamente lo que se suma a la potencia de la máquina.' },
        { q: '¿Por dónde empezar a estudiar IA aplicada al derecho?', a: 'Por el uso real, en tareas que ya dominas y sabes verificar — es donde el error aparece pronto y enseña. Después, por la organización del propio método, que es lo que separa el uso ocasional de la ganancia permanente. La serie Claude AI na Prática Jurídica está publicada gratis en este sitio, en 52 capítulos, y el libro y el curso profundizan el mismo camino con los flujos completos. Todo este material está en portugués.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Hay una pregunta que dejó de tener sentido: <em>¿la inteligencia artificial va a sustituir al abogado?</em> La pregunta útil es otra, y es incómoda — <strong>¿en cuánto tiempo el colega que aprendió a usarla va a entregar en dos días lo que tú entregas en dos semanas?</strong> Este texto trata de por qué estudiar IA no es aprender una herramienta más, sino adquirir un multiplicador que incide sobre todo lo que ya sabes hacer.</p>

${h.fig(1, { legenda: 'Un abogado solo, la estructura de un despacho entero: lo que antes exigía un equipo ahora cabe en una mesa.' })}

<h2>1. La IA no es una herramienta de un área — es una tecnología de propósito general</h2>
<p>Un software jurídico sirve para ejercer la abogacía. Un ERP sirve para administrar. Toda herramienta tradicional nace pegada a un uso. La IA no: es una capa que se acopla a cualquier actividad hecha de texto, razonamiento, análisis, decisión y repetición — y la abogacía está hecha casi enteramente de eso.</p>
<p>La consecuencia es que estudiar IA no añade una materia más a tu formación. Adquiere un multiplicador que incide sobre todo lo que ya sabes. Quien estudia tributario mejora en tributario. <strong>Quien estudia IA mejora en todo lo que hace.</strong></p>

<h2>2. Para dominar la IA estás obligado a explicitar lo que sabes</h2>
<p>Aquí está el mecanismo que casi nadie percibe. El abogado experimentado trabaja mucho por intuición acumulada: sabe &ldquo;de un vistazo&rdquo; si la cláusula es riesgosa, dónde es frágil el escrito de la otra parte, qué argumento suele aceptar ese juzgado. Ese conocimiento es tácito — funciona, pero nunca fue verbalizado.</p>
<p>Para usar IA con calidad, <em>necesita</em> ser verbalizado. Tienes que decir qué quieres, en qué orden, bajo qué criterio, con qué estándar de calidad, evitando qué riesgo. Es decir: usar bien la IA obliga al abogado a volverse profesor de su propio oficio — y nadie sale de ese proceso igual a como entró. Quien configura una IA para revisar contratos descubre, en el camino, cuál es de hecho su método de revisión de contratos. Muchas veces por primera vez en su carrera.</p>
<p>Por eso la ganancia es doble e inseparable: <strong>aprender a usar IA en la abogacía es, al mismo tiempo, una profundización de la propia abogacía.</strong> No es un efecto colateral simpático. Es el funcionamiento normal de la cosa.</p>

<h2>3. Tres capas de competencia se abren a la vez</h2>

<h3>Capa técnica — lo que era de informática</h3>
<p>Automatizaciones, integraciones, bases de conocimiento organizadas, paneles, pequeños sistemas a medida. Antes, cualquiera de esas cosas exigía presupuesto, proveedor, plazo y dependencia: &ldquo;informática lo verá&rdquo;. Hoy quien entiende de IA describe lo que necesita y lo obtiene. No es que el abogado se vuelva programador — es que cayó la barrera de lenguaje entre querer y conseguir. Eso es autonomía, y la autonomía es velocidad.</p>

<h3>Capa del área fin — ejercer mejor</h3>
<p>Investigación más amplia en menos tiempo, análisis de volúmenes que ningún equipo leería, contraste de tesis, simulación del argumento del adversario, revisión de coherencia, borradores producidos a partir de un método que es tuyo. El profesional no es sustituido: es ampliado. Sigue siendo él quien juzga — solo que juzga con más material sobre la mesa y con el trabajo pesado ya hecho.</p>

<h3>Capa de gestión — lo que separaba a los grandes de los pequeños</h3>
<p>Control de plazos, fijación de precios, flujo de caja, indicadores, embudo de clientes, estandarización de calidad, procedimientos escritos, marketing, seguimiento posterior. Nada de eso se enseña en la facultad de derecho, y casi nada de eso puede comprar un despacho pequeño. Con IA, puede construirlo.</p>

<h2>4. El argumento económico: la barrera nunca fue de talento</h2>
<p>La distancia entre el gran despacho y el pequeño nunca fue, principalmente, de talento jurídico. Siempre hubo abogados excelentes trabajando solos. La barrera era de <strong>capacidad instalada</strong>: equipo para absorber volumen, un segundo par de ojos para control de calidad, administración, informática, marketing, gestión. Costo fijo alto, que solo se paga con escala — y la escala solo llega a quien ya tiene estructura. Un círculo cerrado, casi infranqueable para quien empezaba.</p>
<p>La IA rompe ese círculo porque hace una conversión inédita: <strong>transforma costo fijo de estructura en competencia individual.</strong> Lo que antes exigía contratar, formar, supervisar y pagar todos los meses, ahora exige aprender. Y aprender tiene costo marginal decreciente: estudias una vez y lo usas para siempre, en todos los casos.</p>
<p>En la práctica, el despacho pequeño pasa a entregar con el estándar que era exclusividad del grande — la misma profundidad de investigación, la misma consistencia de documentos, el mismo control de plazos, el mismo seguimiento del cliente — sin la nómina que sostenía ese estándar. Y, como el costo es menor, el margen es mayor. El pequeño no solo alcanza al grande: en rentabilidad por profesional, puede superarlo.</p>

<h2>5. Rechazar la IA no es neutralidad — es derrota por ausencia</h2>
<p>Hay que decirlo sin medias tintas, porque es la parte incómoda y verdadera: en varias dimensiones del trabajo jurídico, la IA ya es superior al ser humano. No en algunas, en varias. Velocidad, evidentemente. Pero también amplitud de lectura, resistencia al cansancio, consistencia a las tres de la madrugada, capacidad de comparar quinientos contratos sin saltarse ninguno, de cruzar una tesis con toda la jurisprudencia disponible sin olvidar lo que leyó en la página anterior. Ningún profesional, por brillante que sea, compite con eso. Ningún equipo compite con eso.</p>
<p>Ante un hecho así, negarse a usarla no es prudencia ni fidelidad al oficio. Es elegir disputar el mercado sin una parte de tu capacidad. <strong>Quien se niega a usar la IA ya perdió</strong> — no perderá, ya perdió, porque la comparación ya no es entre él y la máquina, es entre él y el colega que suma la máquina. Y esa comparación la hace el cliente, todos los días, mirando plazo, precio y calidad.</p>

<h2>6. Pero hay una salvedad — y es lo que hace indispensable el estudio</h2>
<p>Superior en varias áreas no significa superior en todas, y la distinción es el núcleo del valor de quien se prepara. La IA es imbatible en rastreo, comparación, consistencia y volumen. Es frágil, y a veces peligrosa, en juicio jurídico, en la atribución de peso a un precedente, en lectura de contexto y en responsabilidad — el uso ingenuo produce desastres ya conocidos, como la cita de un precedente que no existe.</p>
<p>Justamente por eso el estudio decide el resultado. <strong>Si la IA fuera infalible, aprender no haría diferencia: bastaría con apretar el botón.</strong> Es porque se equivoca de maneras específicas y previsibles que el profesional formado tiene una enorme ventaja sobre el no formado. Quien estudia extrae la ganancia y esquiva la trampa. Quien no estudia elige entre quedarse atrás por no usarla o quemarse por usarla mal.</p>

<h2>7. La suma: lo que la IA nunca tendrá, y lo que pasa cuando los dos se juntan</h2>
<p>Aquí llegamos al punto decisivo. Tú tienes cosas que la IA no tiene y probablemente nunca tendrá — no por una limitación técnica pasajera, sino porque son atributos de persona, no de máquina. Son personalísimos:</p>
<ul class="artigo-lista">
  <li><strong>La responsabilidad</strong> — alguien que responde por el error, con nombre, patrimonio y colegiación.</li>
  <li><strong>La confianza construida</strong> — el cliente que te busca porque te conoce desde hace quince años, no porque comparó precios.</li>
  <li><strong>La reputación</strong> ante el juez, el fiscal, el abogado de la otra parte.</li>
  <li><strong>El olfato para el contexto</strong> — saber que ese caso no es sobre dinero, es sobre rencor; que ahí cabe un acuerdo y no una sentencia.</li>
  <li><strong>El coraje</strong> de decidir y firmar.</li>
  <li><strong>La experiencia</strong> de haber vivido aquello antes, con esas personas, en ese juzgado.</li>
  <li><strong>La capacidad</strong> de mirar al cliente a los ojos y decirle la verdad que no quiere oír.</li>
</ul>
<p>Nada de eso es generable. Nada de eso es descargable. Eso eres tú.</p>
<p>Y es exactamente aquí donde el razonamiento se cierra. La IA sola tiene un techo: es rápida y amplia, pero es impersonal, no responde por nada, no conoce a tu cliente, no tiene historia. Tú solo tienes otro techo: eres insustituible en el juicio, pero limitado en volumen, velocidad y resistencia. <strong>Sumados, los dos techos caen.</strong></p>
<p>Quien acepta usarla y se vuelve hábil no queda &ldquo;casi tan bueno como la IA&rdquo;. Queda por encima de ella — porque añade a la potencia de la máquina aquello que la máquina no alcanza, y añade a su experiencia aquello que ninguna experiencia humana alcanza sola. Es la única configuración que supera a las dos partes aisladas. Esos son los superpoderes: no la IA en lugar del abogado, sino la IA acoplada a un abogado que sabe conducirla.</p>

<h2>8. Los tres destinos</h2>
<p>El mercado jurídico se está dividiendo en tres grupos, y la diferencia entre ellos es solo el estudio:</p>
<ul class="artigo-lista">
  <li><strong>Quien la rechaza.</strong> Pierde por ausencia, compitiendo con la mitad de la capacidad contra quien tiene el doble.</li>
  <li><strong>Quien la usa sin aprender.</strong> Gana velocidad y pierde fiabilidad — y un precedente inventado en un escrito cuesta más caro que todo el tiempo ahorrado.</li>
  <li><strong>Quien aprende a usarla.</strong> Suma. Entrega más rápido, con más profundidad, a un costo menor, gestionando su propio despacho con el rigor que antes exigía un equipo — y además pone encima aquello que ninguna máquina pone: presencia, responsabilidad y confianza.</li>
</ul>

<div class="artigo-nota">
  <p><strong>Síntesis.</strong> La IA es general por naturaleza, así que quien la estudia gana tres formaciones a la vez — tecnología, abogacía y gestión. Usarla bien exige organizar el propio conocimiento, así que aprender IA profundiza la abogacía. Convierte costo fijo de estructura en competencia individual, así que derriba la barrera que separaba al pequeño del grande. Y, como ya es superior al ser humano en varios frentes, rechazarla es pérdida segura — mientras que dominarla es la única forma de sumar la potencia de la máquina a lo que solo una persona tiene, y producir un resultado mayor del que la IA y el abogado serían capaces por separado.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">Sigue por el camino completo</span>
  <h2>Claude AI na Prática Jurídica</h2>
  <p>Los 52 capítulos de la serie están publicados gratis en este sitio — desde el primer uso responsable hasta los flujos de trabajo que sostienen un despacho entero. El libro y el curso profundizan el mismo camino, con los guiones listos para aplicar. Todo este material está en portugués.</p>
  <p class="artigo-cta-links">
    <a href="/claude-juridico/">Leer la serie completa (gratis)</a>
    <a href="https://livros.villelastay.com.br/livros/claude-ai-na-pratica-juridica?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=ia-nao-substitui-voce" target="_blank" rel="noopener">Conocer el libro</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=ia-nao-substitui-voce" target="_blank" rel="noopener">Ver el curso en línea</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p>Texto de <strong>Augusto Villela</strong>, abogado (OAB/DF 12.003) y autor de la serie <em>Claude AI na Prática</em>. Refleja la experiencia de aplicar inteligencia artificial a la rutina de un despacho y de una operación de hospedaje — no es asesoría jurídica ni recomendación para un caso concreto.</p>
</div>
`,
    },
  },
  'os-especialistas-mentem': {
    en: {
      titulo: 'Experts lie — and the worst part is that they almost never are | Villela Stay',
      descricao: 'Tobacco, sugar, Vioxx, opioids, alcohol and the pandemic: five decades of documented expert failure, the mechanisms that produce it without requiring bad faith, and what changed now that checking the primary source stopped being expensive.',
      h1: 'Experts lie — and the worst part is that they almost never are',
      dek: 'The cigarette that did no harm, the fat that was to blame, the safe dose of alcohol, the painkiller that was not addictive. A five-decade pattern, the machinery behind it that needs no conspiracy — and why the defence against it just got cheap.',
      faq: [
        { q: 'Is it true that experts lie?', a: 'Deliberate lying exists and is documented — the tobacco industry funded the manufacture of doubt for decades about what its own internal scientists already knew. But most expert error requires no bad faith. It is produced by machinery: whoever pays for the research chooses the question, studies with negative results get published less, regulators tend to be captured by those they regulate, changing your mind in public costs a career, and the public rewards whoever speaks with certainty. That is why the error is systematic and has a direction — and why looking for villains is useless: you have to look at the incentives.' },
        { q: 'What is the best documented case of experts paid to mislead?', a: 'Tobacco. In January 1954 the industry ran the "Frank Statement to Cigarette Smokers" in hundreds of American newspapers, promising independent research, and created the Tobacco Industry Research Committee. An internal Brown & Williamson memo from 1969 puts it without euphemism: "Doubt is our product, since it is the best means of competing with the body of fact that exists in the mind of the general public." The strategy held for some 45 years, even after the 1964 Surgeon General report concluded, across more than 7,000 papers, that smoking causes lung cancer.' },
        { q: 'Did the sugar industry really pay Harvard researchers?', a: 'Yes, and the internal documents were published in 2016 in JAMA Internal Medicine by Cristin Kearns and colleagues. In 1965 the Sugar Research Foundation commissioned the review known as "Project 226" from researchers at the Harvard School of Public Health — among them Mark Hegsted and Robert McGandy — paying the equivalent of about 48,000 dollars in 2016 money. The review appeared in the New England Journal of Medicine in 1967, played down the work linking sugar to coronary disease and pointed at fat instead. The funding was not disclosed. Hegsted would later take part in shaping American dietary guidelines.' },
        { q: 'Is there a safe dose of alcohol?', a: 'On current knowledge, there is no level of consumption that can be said not to affect health. Alcohol has been classified as a Group 1 carcinogen by the IARC since 1988 — the same category as asbestos and tobacco — and the WHO stated in January 2023 that no safe amount exists. The old "J-curve", which suggested a benefit from moderate drinking, fell to a methodological defect: the abstainer group included former drinkers who had quit because they were already ill. The meta-analysis by Stockwell and colleagues, across 107 studies and more than 4.8 million people, found that only 21 were free of that bias — and once corrected, the moderate drinker advantage disappears.' },
        { q: 'What exactly did the experts get wrong during the pandemic?', a: 'The documentable error is not saying the vaccines did not work — they sharply reduced severe disease and death, and claiming otherwise commits the same sin in reverse. The error was asserting more than the data supported, above all about transmission. On 29 March 2021 the CDC director said publicly that vaccinated people "do not carry the virus"; three days later the CDC itself walked it back, saying the evidence was not clear. The registration trials had not tested transmission — which Pfizer never hid, but which did not stop the promise from circulating. Since much of the mandate and passport apparatus rested on that promise, excess certainty turned into coercion.' },
        { q: 'So you should not trust any expert?', a: 'That is the wrong conclusion, and a dangerous one. It was scientists who uncovered the tobacco fraud; researchers reading internal documents who revealed the Harvard payment; epidemiologists who brought down the alcohol J-curve. The corrective for bad science has always been more science, never less. What the record recommends is not distrusting everyone — it is to stop delegating blindly: ask who funded it, what was measured, what the studies that never appeared were saying, and treat excessive certainty as a warning sign rather than a mark of competence.' },
        { q: 'How does artificial intelligence help you check an expert?', a: 'It collapses the cost of what only an expert could do before: read the original study instead of the headline, find out who paid for it, check whether the outcome measured is the one that matters or a surrogate, ask for the systematic review instead of the isolated study, hear the opposing case at its strongest, and translate the jargon. It also lets you hear many qualified opinions without paying a fee for each. But it is no oracle: it learned from the same biased literature and it is trained to please. Use it to locate and check the source — and verify that the source it cited actually exists.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">In <em>Freakonomics</em>, Steven Levitt and Stephen Dubner showed something simple and uncomfortable: when a real estate agent sells their <strong>own</strong> home, they leave it on the market about ten days longer and close for about 3% more than when selling yours. They are not dishonest. They simply know something you do not, and use it in line with their interest — which is not identical to yours. That sentence explains half a century of errors that cost lives: <strong>the expert rarely lies; they respond to incentives you cannot see.</strong></p>

${h.fig(1, { legenda: 'The finding that got published, under the spotlight — and, in the dark, the studies that did not.' })}

<h2>1. Philosophy got there first — by several different roads</h2>
<p>The intuition that the expert misleads was not born in behavioural economics. It has a long lineage, and each link adds a mechanism.</p>
<p><strong>Socrates</strong>, in the <em>Apology</em>, reports seeking out craftsmen expecting to find wisdom. He found real competence — and, alongside it, the flaw that struck him: because they mastered their own trade well, they believed themselves knowledgeable about the greatest questions. It is the first description of the expert who overruns the boundary of their own competence, which is the commonest error of all.</p>
<p><strong>Francis Bacon</strong>, in the <em>Novum Organum</em> (1620), catalogued the <em>idola theatri</em> — the idols of the theatre: received philosophical systems accepted as dogma because they come from authority rather than because they were verified. Bacon was describing the cognitive cost of trusting the school instead of the experiment.</p>
<p><strong>Adam Smith</strong>, in 1776, was harsher and more modern: &ldquo;People of the same trade seldom meet together, even for merriment and diversion, but the conversation ends in a conspiracy against the public, or in some contrivance to raise prices.&rdquo; Note that Smith is not talking about villains — he is describing an outcome that emerges whenever identical interests gather.</p>
<p><strong>George Bernard Shaw</strong> compressed it all into one line in <em>The Doctor&rsquo;s Dilemma</em> (1906): &ldquo;All professions are conspiracies against the laity.&rdquo; The play is about doctors choosing who will live, and about how professional prestige protects itself.</p>
<p>In the twentieth century the argument acquired technical apparatus. <strong>Thomas Kuhn</strong> (1962) showed that the normal scientific community does not try to refute its own paradigm — it solves puzzles inside it, and resists anomalies until it no longer can. <strong>George Stigler</strong>, a future Nobel laureate, formulated <strong>regulatory capture</strong> in 1971: as a rule, he argued, regulation is acquired by the industry and operated for its benefit. <strong>Ivan Illich</strong>, in <em>Medical Nemesis</em> (1975), coined the idea of disabling professions — those that create the dependency they then offer to treat.</p>
<p>And there is empirical verification. <strong>Philip Tetlock</strong> tracked, over twenty years, the forecasts of 284 political and economic experts — more than 80,000 predictions: on average, barely better than chance. Tetlock himself rejects the popular &ldquo;dart-throwing chimpanzee&rdquo; summary, and the caveat matters — the experts beat chance over short horizons, and only approached the chimpanzee when projecting three to five years out. The precise lesson is not that experts know nothing; it is that <strong>their confidence does not fall when their ability to be right falls</strong>.</p>
<p>Finally, <strong>John Ioannidis</strong>, in 2005, published in PLoS Medicine the most cited article in the journal&rsquo;s history, with a title that became a proverb: <em>Why Most Published Research Findings Are False</em>. The argument is not rhetorical but statistical — given typical sample sizes, the number of hypotheses tested and analytical flexibility, in many fields a published claim is more likely to be false than true.</p>

<h2>2. Tobacco: the case that became the manual</h2>
<p>If there is one example where &ldquo;lying&rdquo; is the right word, this is it. In January 1954 the cigarette industry published the <em>Frank Statement to Cigarette Smokers</em> in hundreds of American newspapers, promising to fund independent health research, and created the Tobacco Industry Research Committee for the purpose. What the committee produced over the following decades was not truth: it was controversy.</p>
<p>The strategy is written down, without euphemism, in an internal Brown &amp; Williamson memo from 1969:</p>
<div class="artigo-nota">
  <p>&ldquo;<strong>Doubt is our product</strong>, since it is the best means of competing with the &lsquo;body of fact&rsquo; that exists in the mind of the general public. It is also the means of establishing a controversy.&rdquo;</p>
</div>
<p>Notice what is being said. The stated goal was not to prove that cigarettes are good for you. It was to <strong>prevent consensus from forming</strong> — because for a seller, doubt works as well as approval. By 1964 the Surgeon General&rsquo;s report had already concluded, across more than seven thousand papers, that smoking causes lung cancer. The manufacture of doubt lasted, even so, some 45 years, and was only dismantled when internal documents surfaced in litigation.</p>
<p>Keep this case in mind: it is the mould. All the others repeat parts of it.</p>

<h2>3. Sugar: the day fat took the blame</h2>
<p>In 2016, Cristin Kearns and colleagues published in <em>JAMA Internal Medicine</em> an analysis of internal sugar industry documents. The finding: in 1965 the Sugar Research Foundation commissioned an internal review called <strong>Project 226</strong> from researchers at the Harvard School of Public Health — among them Mark Hegsted and Robert McGandy — paying the equivalent of about <strong>48,000 dollars in 2016 money</strong>. The commission had a declared target: to neutralise the studies linking sucrose to coronary disease.</p>
<p>The review appeared in <strong>1967, in the New England Journal of Medicine</strong>. It disqualified the work incriminating sugar and granted merit only to work pointing at fat and cholesterol. The funding was not disclosed — at the time the journal did not require it. Mark Hegsted would go on to hold an influential position in shaping American dietary guidelines.</p>
<p>What came next is the answer to the complaint about nutrition — that one day they recommend a food and the next they condemn it. It is not scientific fickleness: it is the trail of a badly framed question with money inside it.</p>
<ul class="artigo-lista">
  <li><strong>Fat becomes the villain</strong> and industry answers with &ldquo;low fat&rdquo; products, in which the fat removed is compensated with sugar.</li>
  <li><strong>Margarine is recommended</strong> over butter. Decades later it emerges that the <em>trans</em> fat in partially hydrogenated oils is worse than what it replaced — the US revoked its safe status in 2015, with a ban following.</li>
  <li><strong>The egg is condemned</strong> for cholesterol and later absolved: the 300 mg daily limit was dropped from the American guidelines in 2015.</li>
</ul>
<p>Three reversals, one common origin: strong conclusions drawn from weak evidence, defended by authority, with a commercial interest anchored to each of them.</p>

<h2>4. The pharmaceutical industry: when the error has bodies</h2>
<p>Here the pattern gets more expensive, because the product goes into the vein.</p>
<h3>Thalidomide (1957–1961)</h3>
<p>Sold as a safe sedative for nausea in pregnancy, it produced thousands of children with severe malformations before being withdrawn. It is the founding milestone of modern pharmacovigilance — and the proof that &ldquo;no evidence of harm&rdquo; is not the same as &ldquo;evidence of no harm&rdquo;.</p>
<h3>Vioxx (1999–2004)</h3>
<p>Merck&rsquo;s anti-inflammatory was withdrawn worldwide on <strong>30 September 2004</strong>, after it was confirmed that it doubled the risk of heart attack and stroke with prolonged use. The VIGOR study, in 2000, already showed excess cardiovascular events, interpreted benignly at the time. David Graham, a researcher at the FDA itself, estimated that about <strong>88,000</strong> Americans had heart attacks because of the drug, of whom around <strong>38,000</strong> died. It was not one isolated expert who failed: the manufacturer, peer review and the regulator failed at the same time.</p>
<h3>OxyContin and the opioid epidemic</h3>
<p>This is the most instructive example of all, because it shows how a sentence becomes science. In 1980, Jane Porter and Hershel Jick sent the <em>New England Journal of Medicine</em> a <strong>one-paragraph letter</strong> noting a low rate of dependence among <em>hospitalised</em>, monitored patients receiving opioids. It was not a study. It was a letter.</p>
<p>That letter was cited hundreds of times as if it were evidence that prescribed opioids rarely addict, and it became the basis of marketing: OxyContin advertising claimed the rate of addiction among patients treated by doctors was &ldquo;much less than 1%&rdquo;. In <strong>2007</strong>, Purdue Pharma and three of its executives pleaded guilty to misleading regulators, doctors and patients about the drug&rsquo;s addictive potential. Between the letter and the confession, hundreds of thousands of people died.</p>
<h3>And the silent mechanism: the study that never appears</h3>
<p>None of these cases requires an evil scientist. All it takes is <strong>publication bias</strong>: whoever funds the work is not obliged to publish what they disliked. The effect is arithmetical — if half the studies come out negative and almost only the positive ones are published, the entire literature lies without a single line being false. That is why prospective trial registration and the requirement to publish negative results were the most important reforms in medicine of the last two decades.</p>

<h2>5. Alcohol: the safe dose that never existed</h2>
<p>For thirty years, the official answer to &ldquo;how much can I drink?&rdquo; was a curve. The <strong>J-curve</strong> showed that people who drank a little lived longer than people who drank nothing — and the daily glass of red wine entered popular culture as medical advice.</p>
<p>The problem was methodological, and it has a name: <strong>abstainer bias</strong>, or the &ldquo;<em>sick quitter</em>&rdquo; effect. The comparison group — those who do not drink — was contaminated by people who <em>stopped</em> drinking because they were already ill. Comparing moderate drinkers with that group means comparing healthy people with sick people, and calling the difference a benefit of alcohol.</p>
<p>The meta-analysis by Tim Stockwell and colleagues examined <strong>107 studies</strong>, with more than <strong>4.8 million participants</strong>: only <strong>21</strong> were free of some form of that bias. Once the defect is corrected, the longevity advantage of the moderate drinker disappears. Mendelian randomisation studies, which use genetic variation and escape this kind of confounding, likewise found no cardiovascular protection.</p>
<p>In <strong>January 2023</strong>, the World Health Organization published the blunt conclusion: <strong>there is no level of alcohol consumption that is safe for health</strong>. Ethanol has been classified by the IARC as a <strong>Group 1</strong> carcinogen — the asbestos and tobacco category — since <strong>1988</strong>. Cancer risk begins to rise from the first sip; what exists is lower risk, not zero risk.</p>
<p>And the link to the rest of this article has a date and a price tag. <strong>MACH15</strong> was to be the great randomised trial that would finally answer whether moderate drinking protects the heart. A budget of roughly <strong>100 million dollars</strong>, run under the umbrella of the American NIH — with approximately <strong>two thirds of the funding coming from five industry giants</strong>: Anheuser-Busch InBev, Carlsberg, Diageo, Heineken and Pernod Ricard. In <strong>June 2018</strong>, the NIH cancelled the study after an internal investigation concluded that staff had solicited the industry money and that the trial design was tilted — a primary endpoint favourable to alcohol and insufficient attention to non-cardiovascular risks such as cancer.</p>
<p>In other words: the study that would answer the question was designed, in part, by those who had a preferred answer. This is the same film as 1954, with a different product.</p>

<h2>6. The pandemic: the cost of asserting more than you know</h2>
<p>This is the most recent example and the most keenly felt — and for that reason the one that demands the most discipline, because here the easy error is to commit the same sin in reverse.</p>
<p>Start with what is solid: <strong>the vaccines sharply reduced severe disease and death</strong>. That showed up in the randomised trials and then in population data, and denying it would be exactly what this article criticises — asserting more than the evidence supports. That was not the problem.</p>
<p>The problem was <strong>transmission</strong>, and the certainty with which it was discussed.</p>
<p>On <strong>29 March 2021</strong>, the director of the American CDC, Rochelle Walensky, said on national television that the data suggested vaccinated people &ldquo;do not carry the virus, do not get sick&rdquo;. <strong>Three days later</strong>, on 1 April, the CDC itself walked it back through the press: the director had spoken &ldquo;broadly&rdquo; and the evidence on transmission &ldquo;was not clear&rdquo;. The retraction reached a fraction of the audience of the claim.</p>
<p>In <strong>October 2022</strong>, at the European Parliament, the executive Janine Small confirmed that the Pfizer vaccine <strong>had not been tested for transmission before launch</strong>. Fairness requires saying that Pfizer had never claimed otherwise — the trials measured symptomatic disease, and that was published. And that is where the serious point lies: <strong>the promise that circulated did not come from the label, it came from public communication</strong>, and nobody in authority corrected it while it was useful.</p>
<p>In July 2021, the <strong>Provincetown</strong> outbreak in Massachusetts, published by the CDC itself, made correction unavoidable: of 469 cases, <strong>346 (74%) were in fully vaccinated people</strong>, and measured viral load was equivalent between vaccinated and unvaccinated. The Delta variant had changed the picture; the public message took longer to change with it.</p>
<p><strong>The rare harms are real and were acknowledged.</strong> The Nordic study published in <em>JAMA Cardiology</em> in 2022, covering <strong>23 million</strong> residents, confirmed increased risk of myocarditis and pericarditis after mRNA vaccines, concentrated in <strong>young males after the second dose</strong>: between 4 and 7 excess events per 100,000 vaccinated with the Pfizer product, and between 9 and 28 per 100,000 with Moderna&rsquo;s. These are small numbers — and they are true numbers, which exist and were measured. Several Nordic countries restricted Moderna in young people because of them.</p>
<p>For viral vector vaccines, AstraZeneca <strong>acknowledged in UK court documents in April 2024</strong> that Vaxzevria can cause thrombosis with thrombocytopenia syndrome; in <strong>May 2024</strong> the company withdrew the product worldwide, citing commercial reasons and falling demand.</p>
<p>Two caveats of honesty, because without them the argument loses its value. First: <strong>Denmark did not ban the vaccine for people under 50</strong> — it stopped actively inviting that group in booster campaigns, concentrating the effort on older and higher-risk people, and anyone who wanted the vaccine could still have it. The distorted version circulates widely; using it would repeat the very error we are denouncing. Second: a rare risk does not cancel the benefit for someone at high risk of dying — what it makes untenable is the <strong>zero-risk discourse</strong>, and it was that discourse that was used to make vaccination compulsory or a condition of access to venues, school and employment.</p>
<p>Because this is the genuinely uncomfortable conclusion: <strong>the coercion was built on the part of the promise that had no backing</strong>. Requiring proof of vaccination to enter a restaurant only makes sense if the vaccinated person does not transmit. When it became known that they did, the requirement stayed in place for a while, and debate about it kept being treated as denialism. The experts&rsquo; error here was not the data — it was the <strong>certainty</strong>, and the closing of the space where legitimate doubt could have been voiced.</p>

<h2>7. The pattern: five mechanisms, none of them needing a conspiracy</h2>
<p>Put tobacco, sugar, Vioxx, opioids, alcohol and the pandemic together and what repeats is not villains. It is <strong>machinery</strong>:</p>
<ul class="artigo-lista">
  <li><strong>Whoever pays chooses the question.</strong> No need to falsify results: it is enough to fund the questions whose answers suit you and not fund the others. Project 226 and MACH15 are the same move, 50 years apart.</li>
  <li><strong>What comes out negative never appears.</strong> Publication bias makes the entire literature lie without any single paper being false.</li>
  <li><strong>The regulator is captured.</strong> Stigler described it; Vioxx demonstrated it. The body meant to watch lives alongside, hires from and is funded by those it watches.</li>
  <li><strong>Changing your mind in public is expensive.</strong> Careers are built on theses. Admitting error after twenty years of defending one is not only an intellectual cost but a professional one — and the incentive pushes towards restating.</li>
  <li><strong>Certainty is rewarded; doubt is punished.</strong> Television invitations, funding and prestige go to those who speak firmly. Tetlock measured the result: expert confidence does not fall when the ability to be right falls.</li>
</ul>
<p>Add the five and you get a system that produces error with a direction — always favouring whoever funds — without anyone needing to sit in a room and agree on anything. It is worse than conspiracy, because a conspiracy can be undone by arresting the guilty. This can only be undone by changing incentives.</p>

<h2>8. The wrong conclusion — and why it is dangerous</h2>
<p>The obvious exit from this article would be: trust no one. That would be the wrong reading, and it is worth saying why.</p>
<p>It was <strong>scientists</strong> who uncovered the tobacco fraud. It was a <strong>researcher reading internal documents</strong> and publishing in a medical journal who revealed the sugar industry&rsquo;s payment to Harvard. It was <strong>epidemiologists</strong> reanalysing 107 studies who brought down the alcohol J-curve. It was a <strong>Stanford professor of medicine</strong>, publishing in a scientific journal, who showed that most published findings are false.</p>
<p>In every case, <strong>the corrective for bad science was more science, never less</strong>. Anyone who concludes &ldquo;therefore there is no truth&rdquo; hands the field precisely to those who profit from doubt — which is, literally, the product Brown &amp; Williamson said it was selling. The scepticism that serves is the kind that demands method, not the kind that abandons the idea of evidence.</p>
<p>What the record recommends is something else, more modest and more demanding: <strong>stop delegating blindly</strong>. Not to replace the expert — to audit them.</p>

<h2>9. What changed: auditing the expert got cheap</h2>
<p>Until recently, that advice was empty. &ldquo;Read the original study&rdquo; is easy to say to someone without journal access, without technical English, who does not know what a confidence interval is or where to find the conflict-of-interest statement. Auditing an expert was itself expert work — and experts charge by the hour.</p>
<p>That cost is exactly what artificial intelligence has collapsed. Not because it knows more than the best specialists — on average it knows less, and about the specific case of your body or your lawsuit, far less. But because it performs, in minutes and without fees, the tasks that <em>used to</em> separate the layperson from the primary source:</p>
<ul class="artigo-lista">
  <li><strong>Read the study, not the headline.</strong> The news says &ldquo;coffee reduces mortality&rdquo;; the study says observational cohort, weak association, no control for smoking. The distance between those two sentences is where nearly all the deception lives.</li>
  <li><strong>Ask who paid.</strong> Practically every serious paper today carries a funding and conflict-of-interest statement. Almost nobody reads that section. Now it costs one question.</li>
  <li><strong>Check the outcome measured.</strong> Did the study measure death and heart attack, or a <em>surrogate marker</em> — cholesterol, bone density, viral load? Plenty of approved drugs improve the number without improving the life.</li>
  <li><strong>Ask for the systematic review, not the isolated study.</strong> One study is a large anecdote. What matters is the body of work, and whether it is consistent.</li>
  <li><strong>Hear the opposing case at its strongest.</strong> Explicitly ask for the best argument against what you have just concluded. That is the thing an expert paid to defend a position will never give you for free.</li>
  <li><strong>Consult many without paying each.</strong> A second opinion used to cost a consultation; a third, another. Today you can confront the reasoning of several schools before choosing whom to pay — and arrive at the appointment knowing what to ask.</li>
</ul>

<h2>10. And who audits the AI?</h2>
<p>It would be incoherent to end an article about overconfidence by asking for blind confidence in something else. Artificial intelligence has exactly the defects this text has described, in a new form:</p>
<ul class="artigo-lista">
  <li><strong>It learned from the biased literature.</strong> If an entire decade published that fat was the villain, that is what it absorbed. It reproduces consensus — including when the consensus was bought.</li>
  <li><strong>It is trained to please.</strong> Agreeing with whoever asks is a measurable bias of these models. If you frame the question with the answer already inside it, there is a good chance you will get your own opinion back, better written.</li>
  <li><strong>It invents sources.</strong> A study that does not exist, a precedent never decided, a citation with perfectly plausible author and year. The error is rare enough not to show up in casual use and frequent enough to destroy a piece of work.</li>
</ul>
<p>What corrects all three is the same method, applied to it: <strong>ask for the source and open the source.</strong> Ask for the counter-argument before asking for the supporting one. Do not ask &ldquo;why is X bad for you?&rdquo;, ask &ldquo;what is known about X, and where is the evidence weak?&rdquo;. And check that what it cited exists — because the tool that collapses the cost of checking also collapses the cost of inventing.</p>
<p>Notice that none of this is new. It is the method Bacon proposed against the idols of the theatre: do not accept the authority of the school, go to the experiment. What changed in 2026 was not the method. It was the price.</p>

<div class="artigo-nota">
  <p><strong>In short.</strong> Experts err systematically and in the same direction, and they do not need to lie for it: it is enough that whoever funds chooses the questions, that negative results go unpublished, that the regulator lives alongside the regulated, that reversing yourself costs a career and that the public rewards certainty. Tobacco, sugar, Vioxx, opioids, alcohol and the pandemic are the same machinery in different products. The answer is not to abandon science — it was science that dismantled each of those cases — it is to stop delegating blindly. And what has changed now is that auditing the expert, which used to require another expert, got cheap: reading the source, finding who paid, seeing what was measured and hearing the opposing case now costs a few minutes. Including — and especially — when the expert being audited is the machine itself.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">Learn to do this in practice</span>
  <h2>Claude AI na Prática</h2>
  <p>All 22 chapters of the series are published free on this site — including how to structure research, how to ask for the opposing case and how to check a source before believing it. The book and the course go deeper into the same path. All of this material is in Portuguese.</p>
  <p class="artigo-cta-links">
    <a href="/claude/">Read the full series (free)</a>
    <a href="https://livros.villelastay.com.br/livros?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=os-especialistas-mentem" target="_blank" rel="noopener">See the book</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=os-especialistas-mentem" target="_blank" rel="noopener">See the online course</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p><strong>Sources.</strong> Freakonomics (Levitt and Dubner, 2005) · Adam Smith, <em>The Wealth of Nations</em> (1776) · Bacon, <em>Novum Organum</em> (1620) · Shaw, <em>The Doctor&rsquo;s Dilemma</em> (1906) · Kuhn (1962) · Stigler, <em>The Theory of Economic Regulation</em> (1971) · Illich, <em>Medical Nemesis</em> (1975) · Tetlock, <em>Expert Political Judgment</em> (2005) · Ioannidis, PLoS Medicine (2005) · Brown &amp; Williamson memo (1969) and the <em>Frank Statement</em> (1954) · Kearns, Schmidt and Glantz, <em>JAMA Internal Medicine</em> (2016) · Graham and the <em>Lancet</em> meta-analysis on rofecoxib (2004–2005) · Porter and Jick, <em>NEJM</em> (1980) and the Purdue guilty plea (2007) · Stockwell et al., <em>Journal of Studies on Alcohol and Drugs</em> · WHO/<em>Lancet Public Health</em> (January 2023) and IARC (1988) · the NIH investigation into MACH15 (June 2018) · CDC statements and correction (March and April 2021) · MMWR on Provincetown (July 2021) · Karlstad et al., <em>JAMA Cardiology</em> (2022) · court documents and the withdrawal of Vaxzevria (April and May 2024).</p>
  <p>Written by <strong>Augusto Villela</strong>, lawyer (Brazilian Bar, OAB/DF 12.003) and author of the <em>Claude AI na Prática</em> series. This is an analysis of method and incentives, written for people who must decide using other people&rsquo;s information — it is not medical or nutritional guidance, nor a treatment recommendation. For decisions about your own health, see a professional: the argument of this article is that you should arrive knowing what to ask, not that you should stop going.</p>
</div>
`,
    },
    es: {
      titulo: 'Los expertos mienten — y lo peor es que casi nunca están mintiendo | Villela Stay',
      descricao: 'Tabaco, azúcar, Vioxx, opioides, alcohol y pandemia: cinco décadas de error documentado de los expertos, los mecanismos que lo producen sin exigir mala fe, y qué cambió ahora que consultar la fuente primaria dejó de costar caro.',
      h1: 'Los expertos mienten — y lo peor es que casi nunca están mintiendo',
      dek: 'El cigarrillo que no hacía daño, la grasa que era la culpable, la dosis segura de alcohol, el analgésico que no generaba adicción. Un patrón de cinco décadas, los mecanismos que lo producen sin necesidad de conspiración — y por qué la defensa contra él acaba de abaratarse.',
      faq: [
        { q: '¿Es verdad que los expertos mienten?', a: 'La mentira deliberada existe y está documentada: la industria del tabaco financió durante décadas la fabricación de dudas sobre lo que sus propios científicos internos ya sabían. Pero la mayor parte del error de los expertos no exige mala fe. La producen mecanismos: quien paga la investigación elige la pregunta, los estudios con resultado negativo se publican menos, el regulador tiende a ser capturado por quien regula, cambiar de opinión en público cuesta la carrera, y el público premia a quien habla con certeza. Por eso el error es sistemático y tiene dirección, y por eso no sirve buscar villanos: hay que mirar los incentivos.' },
        { q: '¿Cuál es el caso mejor documentado de expertos pagados para engañar?', a: 'El tabaco. En enero de 1954 la industria publicó en cientos de periódicos estadounidenses el "Frank Statement to Cigarette Smokers", prometiendo investigación independiente, y creó el Tobacco Industry Research Committee. Un memorando interno de Brown & Williamson, de 1969, lo dice sin rodeos: "La duda es nuestro producto, ya que es el mejor medio de competir con el cuerpo de hechos que existe en la mente del público." La estrategia se sostuvo unos 45 años, incluso después de que el informe del Surgeon General de 1964 concluyera, sobre más de 7.000 artículos, que fumar causa cáncer de pulmón.' },
        { q: '¿La industria del azúcar realmente pagó a investigadores de Harvard?', a: 'Sí, y los documentos internos fueron publicados en 2016 en JAMA Internal Medicine por Cristin Kearns y colegas. En 1965 la Sugar Research Foundation encargó la revisión conocida como "Project 226" a investigadores de la Escuela de Salud Pública de Harvard — entre ellos Mark Hegsted y Robert McGandy —, pagando el equivalente a unos 48.000 dólares de 2016. La revisión salió en el New England Journal of Medicine en 1967, minimizó los trabajos que vinculaban el azúcar con la enfermedad coronaria y señaló a la grasa como culpable. La financiación no fue declarada. Hegsted participaría después en la formulación de las directrices alimentarias estadounidenses.' },
        { q: '¿Existe una dosis segura de alcohol?', a: 'Según el conocimiento actual, no hay nivel de consumo del que pueda decirse que no afecta la salud. El alcohol está clasificado como carcinógeno del Grupo 1 por la IARC desde 1988 — la misma categoría del amianto y el tabaco — y la OMS declaró en enero de 2023 que no existe cantidad segura. La antigua "curva J", que sugería beneficio en el consumo moderado, cayó por un defecto de método: el grupo de abstemios incluía a exbebedores que habían dejado de beber por enfermedad. El metaanálisis de Stockwell y colegas, sobre 107 estudios y más de 4,8 millones de personas, encontró que solo 21 estaban libres de ese sesgo — y, corregido, la ventaja del bebedor moderado desaparece.' },
        { q: '¿Qué erraron exactamente los expertos en la pandemia?', a: 'El error documentable no es decir que las vacunas no funcionaron: redujeron mucho la enfermedad grave y la muerte, y afirmar lo contrario es cometer el mismo pecado al revés. El error fue afirmar más de lo que los datos sostenían, sobre todo respecto a la transmisión. El 29 de marzo de 2021 la directora de los CDC afirmó públicamente que las personas vacunadas "no portan el virus"; tres días después los propios CDC se retractaron, diciendo que la evidencia no era clara. Los ensayos de registro no habían probado la transmisión — algo que Pfizer nunca ocultó, pero que no impidió que la promesa circulara. Como buena parte de las exigencias y los pasaportes se apoyaba en esa promesa, el exceso de certeza se convirtió en coerción.' },
        { q: '¿Entonces no hay que confiar en ningún experto?', a: 'Esa es la conclusión equivocada, y es peligrosa. Quien descubrió el fraude del tabaco fueron científicos; quien reveló el pago a Harvard fueron investigadores leyendo documentos internos; quien derribó la curva J del alcohol fueron epidemiólogos. El correctivo de la mala ciencia siempre fue más ciencia, nunca menos. Lo que el historial recomienda no es desconfiar de todos, es dejar de delegar en blanco: preguntar quién financió, qué se midió, qué decían los estudios que no aparecieron — y tratar la certeza excesiva como señal de alerta, no de competencia.' },
        { q: '¿Cómo ayuda la inteligencia artificial a verificar a un experto?', a: 'Derriba el costo de lo que antes solo un experto podía hacer: leer el estudio original en vez del titular, descubrir quién lo financió, ver si el desenlace medido es el que importa o un sustituto, pedir la revisión sistemática en vez del estudio aislado, escuchar la tesis contraria en su punto más fuerte y traducir la jerga. También permite escuchar muchas opiniones calificadas sin pagar honorarios por cada una. Pero no es un oráculo: aprendió en la misma literatura sesgada y está entrenada para agradar. Úsala para localizar y verificar la fuente — y comprueba que la fuente que citó exista de verdad.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">En <em>Freakonomics</em>, Steven Levitt y Stephen Dubner mostraron algo simple e incómodo: el agente inmobiliario, al vender su <strong>propia</strong> casa, la deja en el mercado unos diez días más y cierra por cerca de un 3% más que cuando vende la tuya. No es deshonesto. Simplemente sabe algo que tú no sabes, y lo usa conforme a su interés — que no es idéntico al tuyo. Esa frase explica medio siglo de errores que costaron vidas: <strong>el experto rara vez miente; responde a incentivos que tú no ves.</strong></p>

${h.fig(1, { legenda: 'El hallazgo que se publicó, bajo el foco — y, en la oscuridad, los estudios que no.' })}

<h2>1. La filosofía llegó primero — y por caminos distintos</h2>
<p>La intuición de que el perito engaña no nació en la economía del comportamiento. Tiene un linaje largo, y cada eslabón añade un mecanismo.</p>
<p><strong>Sócrates</strong>, en la <em>Apología</em>, relata haber buscado a los artesanos esperando encontrar sabiduría. Encontró competencia real — y, junto a ella, el defecto que le impresionó: por dominar bien su propio oficio, se creían conocedores de las mayores cuestiones. Es la primera descripción del experto que desborda la frontera de su competencia, que es el error más común de todos.</p>
<p><strong>Francis Bacon</strong>, en el <em>Novum Organum</em> (1620), catalogó los <em>idola theatri</em> — los ídolos del teatro: los sistemas filosóficos recibidos que se aceptan como dogma porque vienen de la autoridad, y no porque hayan sido verificados. Bacon describía el costo cognitivo de confiar en la escuela en vez de en el experimento.</p>
<p><strong>Adam Smith</strong>, en 1776, fue más duro y más moderno: &ldquo;Personas del mismo ramo rara vez se reúnen, incluso para divertirse, sin que la conversación termine en una conspiración contra el público, o en alguna maniobra para elevar los precios.&rdquo; Nótese que Smith no habla de villanos: habla de un resultado que emerge cuando se juntan intereses iguales.</p>
<p><strong>George Bernard Shaw</strong> lo condensó en una línea en <em>The Doctor&rsquo;s Dilemma</em> (1906): &ldquo;Todas las profesiones son conspiraciones contra los legos.&rdquo; La obra trata de médicos eligiendo quién vivirá, y de cómo el prestigio profesional se autoprotege.</p>
<p>En el siglo XX el argumento ganó aparato técnico. <strong>Thomas Kuhn</strong> (1962) mostró que la comunidad científica normal no busca refutar su propio paradigma: resuelve rompecabezas dentro de él y resiste la anomalía hasta que ya no puede. <strong>George Stigler</strong>, futuro Nobel, formuló en 1971 la <strong>captura regulatoria</strong>: por regla general, decía, la regulación es adquirida por la industria y operada en su beneficio. <strong>Ivan Illich</strong>, en <em>Némesis médica</em> (1975), acuñó la idea de profesiones incapacitantes — que crean la dependencia que luego se ofrecen a tratar.</p>
<p>Y hay verificación empírica. <strong>Philip Tetlock</strong> siguió durante veinte años los pronósticos de 284 especialistas políticos y económicos — más de 80.000 predicciones: en promedio, apenas mejores que el azar. El propio Tetlock rechaza el resumen popular del &ldquo;chimpancé lanzando dardos&rdquo;, y la salvedad importa: los peritos superaban al azar en el horizonte corto, y solo se acercaban al chimpancé al proyectar de tres a cinco años. La lección exacta no es que el experto no sepa nada; es que <strong>su confianza no disminuye cuando su capacidad de acertar disminuye</strong>.</p>
<p>Por último, <strong>John Ioannidis</strong>, en 2005, publicó en PLoS Medicine el artículo más citado en la historia de la revista, con el título que se volvió proverbio: <em>Why Most Published Research Findings Are False</em>. El argumento no es retórico sino estadístico: dados el tamaño típico de las muestras, la cantidad de hipótesis probadas y la flexibilidad analítica, en muchos campos es más probable que una afirmación publicada sea falsa que verdadera.</p>

<h2>2. El tabaco: el caso que se volvió manual</h2>
<p>Si hay un ejemplo en el que &ldquo;mentira&rdquo; es la palabra correcta, es este. En enero de 1954, la industria del cigarrillo publicó en cientos de periódicos estadounidenses el <em>Frank Statement to Cigarette Smokers</em>, prometiendo financiar investigación independiente sobre salud, y creó para ello el Tobacco Industry Research Committee. Lo que el comité produjo en las décadas siguientes no fue verdad: fue controversia.</p>
<p>La estrategia está escrita, sin eufemismo, en un memorando interno de Brown &amp; Williamson de 1969:</p>
<div class="artigo-nota">
  <p>&ldquo;<strong>La duda es nuestro producto</strong>, ya que es el mejor medio de competir con el &lsquo;cuerpo de hechos&rsquo; que existe en la mente del público. Es también el medio de establecer una controversia.&rdquo;</p>
</div>
<p>Repare en lo que se está diciendo. El objetivo declarado no era probar que el cigarrillo hace bien. Era <strong>impedir la formación de consenso</strong> — porque la duda, para quien vende, funciona tan bien como la aprobación. En 1964 el informe del Surgeon General ya había concluido, sobre más de siete mil artículos, que fumar causa cáncer de pulmón. La fabricación de dudas duró, aun así, unos 45 años, y solo se desmontó cuando los documentos internos salieron a la luz en litigio.</p>
<p>Guarde este caso: es el molde. Todos los demás repiten partes de él.</p>

<h2>3. El azúcar: el día en que la grasa cargó la culpa</h2>
<p>En 2016, Cristin Kearns y colegas publicaron en <em>JAMA Internal Medicine</em> un análisis de documentos internos de la industria azucarera. El hallazgo: en 1965 la Sugar Research Foundation encargó la revisión interna llamada <strong>Project 226</strong> a investigadores de la Escuela de Salud Pública de Harvard — entre ellos Mark Hegsted y Robert McGandy —, pagando el equivalente a unos <strong>48.000 dólares de 2016</strong>. El encargo tenía blanco declarado: neutralizar los estudios que vinculaban la sacarosa con la enfermedad coronaria.</p>
<p>La revisión salió en <strong>1967, en el New England Journal of Medicine</strong>. Descalificó los trabajos que incriminaban al azúcar y concedió valor solo a los que señalaban grasa y colesterol. La financiación no fue declarada — en la época la revista no lo exigía. Mark Hegsted llegaría a ocupar una posición de influencia en la formulación de las directrices alimentarias estadounidenses.</p>
<p>Lo que vino después es la respuesta a la queja sobre nutrición: que un día recomiendan y al otro condenan el mismo alimento. No es volubilidad de la ciencia: es el rastro de una pregunta mal formulada, con dinero dentro.</p>
<ul class="artigo-lista">
  <li><strong>La grasa se vuelve villana</strong> y la industria responde con productos &ldquo;<em>low fat</em>&rdquo;, en los que la grasa retirada se compensa con azúcar.</li>
  <li><strong>Se recomienda la margarina</strong> en lugar de la mantequilla. Décadas después se descubre que la grasa <em>trans</em> de los aceites parcialmente hidrogenados es peor que aquello que sustituyó — EE. UU. revocó su condición de segura en 2015, con prohibición posterior.</li>
  <li><strong>Se condena el huevo</strong> por el colesterol y luego se lo absuelve: el límite de 300 mg diarios cayó de las directrices estadounidenses en 2015.</li>
</ul>
<p>Tres giros, un origen común: conclusiones fuertes extraídas de evidencia débil, defendidas por autoridad, con un interés comercial anclado en cada una de ellas.</p>

<h2>4. La industria farmacéutica: cuando el error tiene cuerpos</h2>
<p>Aquí el patrón sale más caro, porque el producto entra en la vena.</p>
<h3>Talidomida (1957–1961)</h3>
<p>Vendida como sedante seguro para las náuseas del embarazo, produjo miles de niños con malformaciones graves antes de ser retirada. Es el hito fundador de la farmacovigilancia moderna — y la prueba de que &ldquo;no hay evidencia de daño&rdquo; no es lo mismo que &ldquo;hay evidencia de que no hay daño&rdquo;.</p>
<h3>Vioxx (1999–2004)</h3>
<p>El antiinflamatorio de Merck fue retirado del mercado mundial el <strong>30 de septiembre de 2004</strong>, tras confirmarse que duplicaba el riesgo de infarto e ictus con uso prolongado. El estudio VIGOR, de 2000, ya mostraba exceso de eventos cardiovasculares, interpretado entonces de modo benigno. David Graham, investigador de la propia FDA, estimó en cerca de <strong>88.000</strong> los estadounidenses que sufrieron infarto por el medicamento, de los cuales unos <strong>38.000</strong> murieron. No falló un experto aislado: fallaron el fabricante, la revisión por pares y el regulador, al mismo tiempo.</p>
<h3>OxyContin y la epidemia de opioides</h3>
<p>Este es el ejemplo más didáctico de todos, porque muestra cómo una frase se vuelve ciencia. En 1980, Jane Porter y Hershel Jick enviaron al <em>New England Journal of Medicine</em> una <strong>carta de un párrafo</strong> observando baja tasa de dependencia entre pacientes <em>hospitalizados</em> y monitoreados que recibían opioides. No era un estudio. Era una carta.</p>
<p>Esa carta fue citada cientos de veces como si fuera evidencia de que los opioides recetados rara vez generan adicción, y se convirtió en base de marketing: la publicidad del OxyContin afirmaba que la tasa de dependencia en pacientes tratados por médicos era &ldquo;mucho menor que 1%&rdquo;. En <strong>2007</strong>, Purdue Pharma y tres de sus ejecutivos se declararon culpables de engañar a reguladores, médicos y pacientes sobre el potencial adictivo. Entre la carta y la confesión murieron cientos de miles de personas.</p>
<h3>Y el mecanismo silencioso: el estudio que no aparece</h3>
<p>Ninguno de esos casos exige un científico malvado. Basta el <strong>sesgo de publicación</strong>: quien financia no está obligado a publicar lo que no le gustó. El efecto es aritmético — si la mitad de los estudios da negativo y casi solo se publican los positivos, la literatura entera miente sin que una sola línea sea falsa. Por eso el registro previo de ensayos clínicos y la exigencia de publicar resultados negativos fueron las reformas más importantes de la medicina en las últimas dos décadas.</p>

<h2>5. El alcohol: la dosis segura que nunca existió</h2>
<p>Durante treinta años, la respuesta oficial a &ldquo;¿cuánto puedo beber?&rdquo; fue una curva. La <strong>curva J</strong> mostraba que quien bebía poco vivía más que quien no bebía nada — y la copa diaria de vino tinto entró en la cultura popular como consejo médico.</p>
<p>El problema era metodológico y tiene nombre: <strong>sesgo del abstemio</strong>, o &ldquo;<em>sick quitter</em>&rdquo;. El grupo de comparación — los que no beben — estaba contaminado por personas que <em>dejaron</em> de beber porque ya estaban enfermas. Comparar bebedores moderados con ese grupo es comparar gente sana con gente enferma, y llamar beneficio del alcohol a la diferencia.</p>
<p>El metaanálisis de Tim Stockwell y colegas examinó <strong>107 estudios</strong>, con más de <strong>4,8 millones de participantes</strong>: solo <strong>21</strong> estaban libres de alguna forma de ese sesgo. Corregido el defecto, la ventaja de longevidad del bebedor moderado desaparece. Los estudios de aleatorización mendeliana, que usan variación genética y escapan a ese tipo de confusión, tampoco hallaron protección cardiovascular.</p>
<p>En <strong>enero de 2023</strong>, la Organización Mundial de la Salud publicó la conclusión directa: <strong>no hay nivel de consumo de alcohol seguro para la salud</strong>. El etanol está clasificado por la IARC como carcinógeno del <strong>Grupo 1</strong> — la categoría del amianto y el tabaco — desde <strong>1988</strong>. El riesgo de cáncer empieza a subir desde el primer trago; lo que existe es riesgo menor, no riesgo nulo.</p>
<p>Y el vínculo con el resto del artículo tiene fecha y monto. El <strong>MACH15</strong> sería el gran ensayo clínico aleatorizado para responder finalmente si beber moderadamente protege el corazón. Presupuesto de unos <strong>100 millones de dólares</strong>, conducido bajo el paraguas del NIH estadounidense — con aproximadamente <strong>dos tercios de la financiación provenientes de cinco gigantes del sector</strong>: Anheuser-Busch InBev, Carlsberg, Diageo, Heineken y Pernod Ricard. En <strong>junio de 2018</strong>, el NIH canceló el estudio tras una investigación interna que concluyó que funcionarios habían solicitado el dinero de la industria y que el diseño del ensayo estaba inclinado — desenlace primario favorable al alcohol y atención insuficiente a los riesgos no cardiovasculares, como el cáncer.</p>
<p>Es decir: el estudio que respondería la pregunta fue diseñado, en parte, por quien tenía la respuesta preferida. Es la misma película de 1954, con otro producto.</p>

<h2>6. La pandemia: el costo de afirmar más de lo que se sabe</h2>
<p>Este es el ejemplo más reciente y el más sentido — y por eso mismo el que exige más disciplina, porque aquí el error fácil es cometer el mismo pecado al revés.</p>
<p>Empecemos por lo sólido: <strong>las vacunas redujeron mucho la enfermedad grave y la muerte</strong>. Eso apareció en los ensayos aleatorizados y después en los datos poblacionales, y negarlo sería exactamente lo que este artículo critica: afirmar más de lo que la evidencia sostiene. El problema no fue ese.</p>
<p>El problema fue la <strong>transmisión</strong>, y la certeza con que se habló de ella.</p>
<p>El <strong>29 de marzo de 2021</strong>, la directora de los CDC estadounidenses, Rochelle Walensky, afirmó en cadena nacional que los datos sugerían que las personas vacunadas &ldquo;no portan el virus, no se enferman&rdquo;. <strong>Tres días después</strong>, el 1 de abril, los propios CDC se retractaron ante la prensa: la directora había hablado &ldquo;de modo amplio&rdquo; y la evidencia sobre transmisión &ldquo;no era clara&rdquo;. La rectificación tuvo una fracción de la audiencia de la afirmación.</p>
<p>En <strong>octubre de 2022</strong>, en el Parlamento Europeo, la ejecutiva Janine Small confirmó que la vacuna de Pfizer <strong>no había sido probada respecto a la transmisión antes del lanzamiento</strong>. Hay que ser justo: Pfizer nunca había afirmado lo contrario — los ensayos medían enfermedad sintomática, y eso estaba publicado. Y ahí está el punto grave: <strong>la promesa que circuló no vino del prospecto, vino de la comunicación pública</strong>, y nadie con autoridad la corrigió mientras era útil.</p>
<p>En julio de 2021, el brote de <strong>Provincetown</strong>, en Massachusetts, publicado por los propios CDC, volvió inevitable la corrección: de 469 casos, <strong>346 (74%) estaban en personas completamente vacunadas</strong>, y la carga viral medida era equivalente entre vacunados y no vacunados. La variante Delta había cambiado el cuadro; el mensaje público tardó en cambiar con ella.</p>
<p><strong>Los daños raros son reales y fueron reconocidos.</strong> El estudio nórdico publicado en <em>JAMA Cardiology</em> en 2022, sobre <strong>23 millones</strong> de residentes, confirmó aumento del riesgo de miocarditis y pericarditis tras vacunas de ARNm, concentrado en <strong>hombres jóvenes tras la segunda dosis</strong>: entre 4 y 7 eventos en exceso por 100.000 vacunados con el inmunizante de Pfizer, y entre 9 y 28 por 100.000 con el de Moderna. Son números pequeños — y son números verdaderos, que existen y fueron medidos. Varios países nórdicos restringieron el uso de Moderna en jóvenes por causa de ellos.</p>
<p>En el caso de las vacunas de vector viral, AstraZeneca <strong>reconoció en documentos judiciales en el Reino Unido, en abril de 2024</strong>, que Vaxzevria puede causar trombosis con síndrome de trombocitopenia; en <strong>mayo de 2024</strong> la empresa retiró el producto del mercado mundial, alegando razones comerciales y caída de la demanda.</p>
<p>Dos salvedades de honestidad, porque sin ellas el argumento pierde valor. Primera: <strong>Dinamarca no prohibió la vacuna para menores de 50 años</strong> — dejó de invitar activamente a ese grupo en campañas de refuerzo, concentrando el esfuerzo en los mayores y en los de mayor riesgo, y quien quisiera pudo seguir vacunándose. La versión distorsionada circula mucho; usarla sería repetir el error que estamos denunciando. Segunda: un riesgo raro no anula el beneficio en quien tenía alto riesgo de morir — lo que vuelve insostenible es el <strong>discurso de riesgo cero</strong>, y fue ese discurso el que se usó para volver obligatoria la vacunación o condición de acceso a lugares, escuela y empleo.</p>
<p>Porque esta es la conclusión realmente incómoda: <strong>la coerción se construyó sobre la parte de la promesa que no tenía respaldo</strong>. Exigir el comprobante para entrar a un restaurante solo tiene sentido si el vacunado no transmite. Cuando se supo que transmitía, la exigencia permaneció un tiempo, y el debate sobre ella siguió siendo tratado como negacionismo. El error del experto aquí no fue el dato — fue la <strong>certeza</strong>, y el cierre del espacio donde la duda legítima podría haberse dicho.</p>

<h2>7. El patrón: cinco mecanismos, ninguno necesita conspiración</h2>
<p>Juntando tabaco, azúcar, Vioxx, opioides, alcohol y pandemia, lo que se repite no son villanos. Son <strong>engranajes</strong>:</p>
<ul class="artigo-lista">
  <li><strong>Quien paga elige la pregunta.</strong> No hace falta falsificar resultados: basta financiar las preguntas cuyas respuestas convienen y no financiar las otras. El Project 226 y el MACH15 son el mismo movimiento, con 50 años de distancia.</li>
  <li><strong>Lo que da negativo no aparece.</strong> El sesgo de publicación hace que la literatura entera mienta sin que ningún artículo sea falso.</li>
  <li><strong>El regulador es capturado.</strong> Stigler lo describió; Vioxx lo demostró. El órgano que debería vigilar convive, contrata y es financiado por quien vigila.</li>
  <li><strong>Cambiar de opinión en público cuesta caro.</strong> Las carreras se construyen sobre tesis. Reconocer el error tras veinte años de defensa no es solo un costo intelectual, es un costo profesional — y el incentivo empuja a reafirmar.</li>
  <li><strong>La certeza se premia; la duda se castiga.</strong> La invitación a la televisión, el presupuesto y el prestigio van a quien habla con firmeza. Tetlock midió el resultado: la confianza del experto no cae cuando cae su capacidad de acertar.</li>
</ul>
<p>Sume los cinco y tendrá un sistema que produce error con dirección — siempre a favor de quien financia — sin que nadie necesite sentarse en una sala a pactar nada. Es peor que una conspiración, porque una conspiración puede deshacerse deteniendo a los culpables. Esto solo se deshace cambiando incentivos.</p>

<h2>8. La conclusión equivocada — y por qué es peligrosa</h2>
<p>La salida obvia de este artículo sería: no confíes en nadie. Sería la lectura equivocada, y vale decir por qué.</p>
<p>Quien descubrió el fraude del tabaco fueron <strong>científicos</strong>. Quien reveló el pago de la industria azucarera a Harvard fue una <strong>investigadora leyendo documentos internos</strong> y publicando en una revista médica. Quien derribó la curva J del alcohol fueron <strong>epidemiólogos</strong> reanalizando 107 estudios. Quien mostró que la mayoría de los hallazgos publicados es falsa fue un <strong>profesor de medicina de Stanford</strong>, publicando en una revista científica.</p>
<p>En todos los casos, <strong>el correctivo de la mala ciencia fue más ciencia, nunca menos</strong>. Quien concluye &ldquo;luego no existe la verdad&rdquo; entrega el campo exactamente a quien lucra con la duda — que es, literalmente, el producto que Brown &amp; Williamson decía vender. El escepticismo que sirve es el que exige método, no el que abandona la idea de evidencia.</p>
<p>Lo que el historial recomienda es otra cosa, más modesta y más exigente: <strong>dejar de delegar en blanco</strong>. No sustituir al experto — auditarlo.</p>

<h2>9. Lo que cambió: auditar al experto se abarató</h2>
<p>Hasta hace poco, ese consejo era vacío. &ldquo;Lee el estudio original&rdquo; es fácil de decir a quien no tiene acceso a la revista, no lee inglés técnico, no sabe qué es un intervalo de confianza ni dónde buscar la declaración de conflicto de intereses. Auditar a un experto era, en sí mismo, trabajo de experto — y el experto cobra caro por hora.</p>
<p>Es exactamente ese costo el que la inteligencia artificial derribó. No porque sepa más que los mejores peritos — en promedio sabe menos, y sobre el caso concreto de tu cuerpo o de tu proceso, mucho menos. Sino porque ejecuta, en minutos y sin honorarios, las tareas que <em>antes</em> separaban al lego de la fuente primaria:</p>
<ul class="artigo-lista">
  <li><strong>Leer el estudio, no el titular.</strong> La noticia dice &ldquo;el café reduce la mortalidad&rdquo;; el estudio dice cohorte observacional, asociación débil, sin control de tabaquismo. La distancia entre esas dos frases es donde vive casi todo el engaño.</li>
  <li><strong>Preguntar quién pagó.</strong> Prácticamente todo artículo serio hoy trae declaración de financiación y de conflicto de intereses. Casi nadie lee esa sección. Ahora cuesta una pregunta.</li>
  <li><strong>Verificar el desenlace medido.</strong> ¿El estudio midió muerte e infarto, o midió un <em>marcador sustituto</em> — colesterol, densidad ósea, carga viral? Muchos fármacos aprobados mejoran el número y no mejoran la vida.</li>
  <li><strong>Pedir la revisión sistemática, no el estudio aislado.</strong> Un estudio es una anécdota grande. Lo que importa es el conjunto, y si es consistente.</li>
  <li><strong>Escuchar la tesis contraria en su punto más fuerte.</strong> Pida explícitamente el mejor argumento contra lo que acaba de concluir. Es lo que un experto pagado para defender una posición nunca le dará gratis.</li>
  <li><strong>Consultar a muchos sin pagar a cada uno.</strong> Antes, una segunda opinión costaba una consulta; una tercera, otra. Hoy es posible confrontar el razonamiento de varias escuelas antes de elegir a quién pagar — y llegar a la consulta sabiendo qué preguntar.</li>
</ul>

<h2>10. ¿Y quién audita a la IA?</h2>
<p>Sería incoherente terminar un artículo sobre exceso de confianza pidiendo confianza ciega en otra cosa. La inteligencia artificial tiene exactamente los defectos que este texto describió, en forma nueva:</p>
<ul class="artigo-lista">
  <li><strong>Aprendió en la literatura sesgada.</strong> Si toda una década publicó que la grasa era la villana, eso es lo que absorbió. Reproduce el consenso — incluso cuando el consenso fue comprado.</li>
  <li><strong>Está entrenada para agradar.</strong> Concordar con quien pregunta es un sesgo medible de los modelos. Si formula la pregunta con la respuesta ya dentro, hay buena probabilidad de recibir su propia opinión de vuelta, mejor escrita.</li>
  <li><strong>Inventa fuentes.</strong> Un estudio que no existe, un precedente nunca juzgado, una cita con autor y año perfectamente plausibles. El error es raro como para no aparecer en el uso casual y frecuente como para destruir un trabajo.</li>
</ul>
<p>Lo que corrige los tres es el mismo método, aplicado a ella: <strong>pida la fuente y abra la fuente.</strong> Pregunte por el argumento contrario antes de pedir el favorable. No pregunte &ldquo;¿por qué X hace mal?&rdquo;, pregunte &ldquo;¿qué se sabe sobre X, y dónde es débil la evidencia?&rdquo;. Y compruebe que lo que citó existe — porque la herramienta que derriba el costo de verificar también derriba el costo de inventar.</p>
<p>Nótese que nada de esto es nuevo. Es el método que Bacon propuso contra los ídolos del teatro: no aceptar la autoridad de la escuela, ir al experimento. Lo que cambió en 2026 no fue el método. Fue el precio.</p>

<div class="artigo-nota">
  <p><strong>Síntesis.</strong> El experto se equivoca de forma sistemática y en la misma dirección, y para eso no necesita mentir: basta con que quien financia elija las preguntas, que los resultados negativos no se publiquen, que el regulador conviva con el regulado, que retractarse cueste la carrera y que el público premie a quien habla con certeza. Tabaco, azúcar, Vioxx, opioides, alcohol y pandemia son el mismo mecanismo en productos distintos. La respuesta no es abandonar la ciencia — fue la ciencia la que desmontó cada uno de esos casos —, es dejar de delegar en blanco. Y lo que cambió ahora es que auditar al experto, algo que antes exigía otro experto, se abarató: leer la fuente, hallar quién pagó, ver qué se midió y escuchar la tesis contraria cuesta hoy unos minutos. Incluso — y principalmente — cuando el experto auditado es la propia máquina.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">Aprende a hacerlo en la práctica</span>
  <h2>Claude AI na Prática</h2>
  <p>Los 22 capítulos de la serie están publicados gratis en este sitio — incluyendo cómo estructurar una investigación, cómo pedir la tesis contraria y cómo verificar una fuente antes de creerla. El libro y el curso profundizan el mismo camino. Todo este material está en portugués.</p>
  <p class="artigo-cta-links">
    <a href="/claude/">Leer la serie completa (gratis)</a>
    <a href="https://livros.villelastay.com.br/livros?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=os-especialistas-mentem" target="_blank" rel="noopener">Conocer el libro</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=os-especialistas-mentem" target="_blank" rel="noopener">Ver el curso en línea</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p><strong>Fuentes.</strong> Freakonomics (Levitt y Dubner, 2005) · Adam Smith, <em>La riqueza de las naciones</em> (1776) · Bacon, <em>Novum Organum</em> (1620) · Shaw, <em>The Doctor&rsquo;s Dilemma</em> (1906) · Kuhn (1962) · Stigler, <em>The Theory of Economic Regulation</em> (1971) · Illich, <em>Némesis médica</em> (1975) · Tetlock, <em>Expert Political Judgment</em> (2005) · Ioannidis, PLoS Medicine (2005) · memorando Brown &amp; Williamson (1969) y el <em>Frank Statement</em> (1954) · Kearns, Schmidt y Glantz, <em>JAMA Internal Medicine</em> (2016) · Graham y el metaanálisis del <em>Lancet</em> sobre rofecoxib (2004–2005) · Porter y Jick, <em>NEJM</em> (1980) y la confesión de Purdue (2007) · Stockwell et al., <em>Journal of Studies on Alcohol and Drugs</em> · OMS/<em>Lancet Public Health</em> (enero de 2023) e IARC (1988) · investigación del NIH sobre el MACH15 (junio de 2018) · declaraciones y rectificación de los CDC (marzo y abril de 2021) · MMWR sobre Provincetown (julio de 2021) · Karlstad et al., <em>JAMA Cardiology</em> (2022) · documentos judiciales y retirada de Vaxzevria (abril y mayo de 2024).</p>
  <p>Texto de <strong>Augusto Villela</strong>, abogado (OAB/DF 12.003) y autor de la serie <em>Claude AI na Prática</em>. Es un análisis de método e incentivos, escrito para quien necesita decidir con información de terceros — no es orientación médica ni nutricional ni recomendación de tratamiento. Para decisiones sobre su salud, consulte a un profesional: el argumento de este artículo es que llegue sabiendo qué preguntar, no que deje de ir.</p>
</div>
`,
    },
  },
  'quantas-vezes-pedir-para-refazer': {
    en: {
      titulo: 'How many times can you ask for it to be redone? The cost no spreadsheet shows | Villela Stay',
      descricao: 'The social ceiling on revisions, the tax you pay in tact, the time of day that changes a doctor&rsquo;s decision, and what all of it really costs — with the numbers on turnover, presenteeism and payroll, and where artificial intelligence solves it and where it does not.',
      h1: 'How many times can you ask for it to be redone?',
      dek: 'The third time is already awkward; the fourth is a risk. That invisible ceiling quietly lowers the quality of everything you hire — and it is only part of what coordinating human beings costs. This is the full calculation, with what AI changes and what it does not.',
      faq: [
        { q: 'What does an employee really cost in Brazil?', a: 'Salary is the smallest part of the bill. Adding employer social security, the FGTS severance fund, provisions for holidays and the thirteenth salary, termination penalties and benefits, total cost usually lands between 70% and 100% above gross pay. And that is only payroll. Outside it sit HR, occupational health and safety, the whistleblowing channel, training, staff parties, bonuses, prizes and management time — which nobody records anywhere, but which is paid in the manager&rsquo;s hours.' },
        { q: 'What does it cost to lose an employee?', a: 'According to Gallup, replacing someone costs between 50% and 200% of the annual salary for the role, depending on seniority — and voluntary turnover consumes roughly one trillion dollars a year in the United States alone. The bulk is not recruitment: it is the open vacancy, the six to twelve months until the replacement performs like the person who left, the knowledge that walked out of the door, and the manager&rsquo;s time diverted into hiring.' },
        { q: 'What is presenteeism and why does it cost more than absence?', a: 'Presenteeism is being present without performing — ill, exhausted, worried, disengaged. Estimates collected by the Harvard Business Review put the cost at around 150 billion dollars a year in the United States. Per day, absence costs more, because output is zero. In aggregate, presenteeism costs more, because it happens far more often and nobody measures it: it shows up in no report, since the person clocked in.' },
        { q: 'Does the time of day really change the quality of a professional decision?', a: 'It does, and it has been measured in high-level professionals deciding serious things. A study published in JAMA Network Open in 2019 found that primary care physicians ordered mammograms in 63.7% of 8 a.m. appointments and in 47.8% of 5 p.m. appointments; for colorectal cancer screening, the rate fell from 36.5% to 23.4%. Another study, in JAMA Internal Medicine in 2014, found inappropriate antibiotic prescribing rising as the clinic session wore on. It is not laziness: it is decision fatigue, and it affects everyone.' },
        { q: 'How many times can you ask for work to be redone without giving offence?', a: 'There is no legal number, and that is precisely the problem: the limit is social and everyone feels their own. In practice the first revision is normal, the second is accepted with effort, the third carries awkwardness and the fourth tends to be read as persecution — regardless of whether the work is good. The effect is that a great deal is delivered and accepted at the "good enough" level, not because anyone settled for that quality, but because insisting was expensive for the relationship.' },
        { q: 'So artificial intelligence replaces the employee?', a: 'No, and treating it that way is expensive. It does not sign, does not answer for mistakes, holds no professional registration, has no relationship with your client and does not know what nobody told it. What it replaces is ITERATION — the fifth version, the 11 p.m. revision, the direct instruction with no cushioning. Swapping people for AI where AI cannot reach does not save money: it moves the cost into liability, which arrives later and larger.' },
        { q: 'Is there real evidence that AI improves quality, not just speed?', a: 'There is, measured in experiments. In the study by Noy and Zhang published in Science in 2023, with 453 college-educated professionals, task time fell 40% and quality as graded by third parties rose 18%. In the study by Brynjolfsson, Li and Raymond, with 5,179 support agents, productivity rose 14% on average — and 34% among the least experienced. The pattern in both is the same: the gain is largest for those who know least, which changes the arithmetic of whom you need to hire.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Ask a photographer to reshoot. They reshoot. Ask again: they reshoot, with a different kind of silence. Ask a third time and something shifts in the relationship — even if you are right, even if you are paying. By the fourth, you are no longer asking for quality: in their eyes, you are picking on them. <strong>There is a ceiling on how many times you can ask for work to be redone, and that ceiling has nothing to do with whether the work is good.</strong> It is social. And it is enormously expensive.</p>

${h.fig(1, { legenda: 'The same piece of work, redone as many times as needed — and nobody gets tired.' })}

<h2>Part I — The cost no spreadsheet shows</h2>

<h3>1. The revision ceiling</h3>
<p>No contract states how many revisions are included. No building code sets how many times the painter may be called back. The limit exists anyway, and everyone knows it by instinct: the first revision is normal, the second is accepted with some effort, the third carries awkwardness, the fourth becomes persecution.</p>
<p>Notice what that produces, because it is subtle and it is the point of this article. <strong>It is not that bad work gets accepted.</strong> It is that there is a wide band — between &ldquo;good&rdquo; and &ldquo;excellent&rdquo; — in which you <em>give up</em>. The architect delivered a plan that works but does not delight; the accountant did what was asked, not what was possible; the lawyer wrote the correct brief, not the best one. You look at it, consider asking for another round, calculate the social cost of that, and sign.</p>
<p>The aggregate result of that giving-up is invisible precisely because it is never recorded. There is no accounting line called &ldquo;quality I stopped demanding so as not to cause embarrassment&rdquo;. But it is in the final product of almost everything you have ever hired.</p>
<p>And the effect runs both ways, which makes it worse. The person doing the work also knows where the ceiling sits — and, knowing it, calibrates delivery at the point where the client probably will not ask again. It is not dishonesty: it is economising effort in a system where demanding is costly for both sides. <strong>&ldquo;Good enough&rdquo; is not what people are capable of. It is the equilibrium of a game in which insisting has a price.</strong></p>

<h3>2. The tax you pay in tact</h3>
<p>Now the second cost, which the manager pays in hours of their own life: saying things.</p>
<p>A mistake that could be explained in one sentence — &ldquo;this is wrong here, redo it like this&rdquo; — is not said in one sentence. It is wrapped. You start with praise, soften in the middle, finish with encouragement. You pick the moment, pick the channel, avoid doing it in front of others, postpone to Monday because on Friday the person was having a bad day. There is even a named method for this, the feedback sandwich, taught as technique — which confirms that wrapping is compulsory.</p>
<p>Add up the time. A manager with ten reports spends, weekly, several hours purely on the <strong>packaging</strong> of what needed to be said. Not on the decision, not on the analysis: on the packaging. Multiply by a year and you have entire weeks of skilled work consumed by the task of communicating without wounding.</p>
<p>And in Brazil that cost has stopped being merely a matter of time. It has become legal and mandatory:</p>
<ul class="artigo-lista">
  <li><strong>Law 14.457/2022</strong> requires companies with a workplace safety committee to maintain a <strong>whistleblowing channel</strong> for moral and sexual harassment, with anonymity guaranteed, and to include the subject in committee training.</li>
  <li>The <strong>updated NR-1 regulation</strong> (Ministry of Labour Ordinance 1.419/2024) incorporated <strong>psychosocial risks</strong> into occupational risk management. After a twelve-month extension, the requirement became <strong>enforceable from May 2026</strong> — and it does not distinguish by company size: what varies is the complexity of the assessment, not the duty to perform it.</li>
  <li>And there is the liability. Recognised harassment generates compensation, and Brazil&rsquo;s Supreme Court has ruled that the labour code&rsquo;s damages schedule is <strong>not a ceiling</strong> — awards range from a few thousand to hundreds of thousands of reais, according to severity and the defendant&rsquo;s means.</li>
</ul>
<p>None of this is unjust. Requiring respect in the workplace is civilisation, and anyone who has lived with a shouting boss knows what the law is protecting. But one must be honest about the arithmetic: <strong>the right not to be mistreated has an operational price, and that price is paid in circumlocution, in time, and in quality left undemanded.</strong></p>

<h3>3. What fatigue does to a decision</h3>
<p>You may be wondering about the employee who is ill, in a bad mood, at the end of the shift or on the eve of holidays. There is a measured answer — and it is graver than intuition suggests, because it was measured in <strong>doctors</strong>, deciding about <strong>cancer</strong>.</p>
<p>A study published in <em>JAMA Network Open</em> in 2019 tracked screening orders in primary care by appointment time:</p>
<div class="artigo-nota">
  <p><strong>Mammography:</strong> ordered in <strong>63.7%</strong> of 8 a.m. appointments — and in <strong>47.8%</strong> of 5 p.m. appointments.<br>
  <strong>Colorectal cancer screening:</strong> <strong>36.5%</strong> at 8 a.m. — and <strong>23.4%</strong> at 5 p.m.</p>
</div>
<p>Same disease. Same doctor. Same eligible patient. The difference is the clock. An earlier study, in <em>JAMA Internal Medicine</em> in 2014, found the mirror image: <em>inappropriate</em> antibiotic prescribing for respiratory infection <strong>rose</strong> as the session advanced — when you are tired, it is easier to give in than to explain why not.</p>
<p>It is called decision fatigue, and the essential point is that <strong>it is not a character flaw</strong>. It is not laziness, not ill will, and it is not fixed with bonuses or motivational talks. It is biology, and it strikes the most dedicated person on your team exactly as it strikes the most careless. What you hire is not a constant capacity: it is a curve that rises, falls, drops on Friday, vanishes before holidays and returns slowly afterwards.</p>

<h2>Part II — The spreadsheet, opened</h2>
<p>With the part you feel established, to the part you can add up: what it costs to keep someone, to please them, to lose them. The numbers exist.</p>

<h3>4. What it costs to keep</h3>
<p>In Brazil, gross salary is the smallest part of the bill. Employer social security contributions (around 28.8% for companies under the main tax regimes), the 8% FGTS severance fund, holiday provision with its constitutional third (11.11%), thirteenth-salary provision (8.33%), termination penalty provision — added to benefits such as transport, meals and health insurance, the <strong>total cost usually lands between 70% and 100% above gross pay</strong>.</p>
<p>And that is only payroll. Outside it, entering no cost-per-employee spreadsheet at all, sit:</p>
<ul class="artigo-lista">
  <li><strong>HR</strong> — recruitment, selection, onboarding, appraisal, climate surveys, offboarding.</li>
  <li><strong>Compliance and employment law</strong> — internal policy, whistleblowing channel, mandatory training, defending claims.</li>
  <li><strong>Health and safety</strong> — examinations, risk management programmes and, since 2026, mapping psychosocial risks.</li>
  <li><strong>Engagement</strong> — parties, awards, gifts, internal campaigns, climate surveys, flexible benefits.</li>
  <li><strong>Management time</strong> — the most expensive line and the only one never recorded: the manager&rsquo;s hours spent talking, mediating, motivating, correcting carefully and rephrasing the same request another way.</li>
</ul>

<h3>5. What it costs to lose</h3>
<p>According to Gallup, replacing an employee costs <strong>between 50% and 200% of the annual salary</strong> for the role, depending on seniority — and voluntary turnover consumes, in the United States alone, something close to <strong>one trillion dollars a year</strong>.</p>
<p>The common error is imagining this is the cost of the job advert. It is not. It is the open vacancy producing zero, the replacement taking six to twelve months to perform like their predecessor, accumulated knowledge walking out of the door, the rest of the team absorbing the overload — and, often, resigning next.</p>

<h3>6. What it costs to be present without performing</h3>
<p>Here is management&rsquo;s most underestimated number. <strong>Absenteeism</strong> — not showing up — is measured by everyone, because it is visible. <strong>Presenteeism</strong> — being there without performing — is measured by almost nobody, because the person clocked in.</p>
<p>Estimates collected by the <em>Harvard Business Review</em> put the cost of presenteeism at around <strong>150 billion dollars a year</strong> in the United States. Per day, absence costs more, because output is zero. In aggregate, presenteeism costs more — because it happens far more often, and because nobody sees it in order to fix it.</p>
<p>And note the trap: policies designed to reduce absence (pressure to attend, docked pay, monitoring) tend to <strong>increase</strong> presenteeism. You swap a visible cost for an invisible and larger one, and celebrate the indicator.</p>

<h2>Part III — Where artificial intelligence comes in</h2>

<h3>7. What it actually removes</h3>
<p>The central observation deserves to be stated precisely: <strong>AI does not remove the work. It removes the social friction around the work.</strong></p>
<ul class="artigo-lista">
  <li><strong>Revision loses its ceiling.</strong> The fifth version costs the same as the first: tokens. It costs no awkwardness, no relationship, and breeds no resentment on the sixth attempt. For the first time, the number of iterations is decided by the <em>quality you want</em>, not by the limit of what you can decently ask for.</li>
  <li><strong>Instruction becomes direct again.</strong> &ldquo;This is wrong, redo it like this&rdquo; is a complete and sufficient sentence. No preamble, no sandwich, no choosing the moment. The time spent cushioning goes back in your pocket.</li>
  <li><strong>There is no time of day.</strong> No eve of holidays, no return from holidays, no Monday, no Friday at 5 p.m., no headache, no argument at home, no decision fatigue. The performance curve is flat — which, after the numbers in section 3, stops being a detail and becomes a difference in quality.</li>
  <li><strong>There is no availability ceiling.</strong> At 11 p.m. on a Sunday the marginal cost is the same as 10 a.m. on a Tuesday.</li>
</ul>
<p>And the gain is not a promise: it was measured in controlled experiments. In the study by <strong>Noy and Zhang</strong>, published in <em>Science</em> in 2023 with 453 college-educated professionals, task time fell <strong>40%</strong> and quality as graded by third parties rose <strong>18%</strong> — both at once, which is precisely what rarely happens. In the study by <strong>Brynjolfsson, Li and Raymond</strong>, with <strong>5,179</strong> support agents, productivity rose <strong>14%</strong> on average and <strong>34%</strong> among the least experienced.</p>
<p>Hold on to that last cut, because it is what changes the business arithmetic: <strong>the gain is largest for those who know least</strong>. It is not that AI makes the excellent professional redundant — it barely moves their needle. It is that it brings the beginner closer to the standard of the experienced, and that alters whom you need to hire to deliver a given level.</p>
<p>The dependencies are real: internet up, machine working, account paid, credits available. The irony is worth noting — those are exactly the same conditions whose absence would also delay an employee. The difference is that these fail occasionally, while the human condition fails a little every day.</p>

<h3>8. Where it does not come in — and this part is not a courtesy caveat</h3>
<p>An article that stopped at the previous section would be selling an expensive illusion. The boundary matters more than the promise:</p>
<ul class="artigo-lista">
  <li><strong>It does not sign and does not answer.</strong> It holds no bar, engineering, medical or accountancy registration; it is not a defendant, it pays no damages, it cannot be struck off. In anything requiring professional responsibility, the name on the document remains a person&rsquo;s — and whoever signs must be able to check what they sign.</li>
  <li><strong>It has no relationship with your client.</strong> Trust built over fifteen years is not a service you buy by the token.</li>
  <li><strong>It does not know what nobody told it.</strong> Half of a veteran&rsquo;s good work comes from tacit context — what the boss did not say, what that client hates, what went wrong last time. None of that is in the request.</li>
  <li><strong>It errs in a way that is harder to catch.</strong> It errs confidently, in plausible format, including by inventing sources. Whoever reviews must understand the subject — which is why it lifts those who know, but does not rescue those who do not.</li>
  <li><strong>HR and compliance are not waste.</strong> NR-1 and Law 14.457/2022 exist for reasons anyone who has worked under an abusive boss will recognise. The argument of this text is that the cost should be <em>counted</em>, not that it should be eliminated — and no tool removes a legal obligation.</li>
  <li><strong>Tact also produces something good.</strong> A team that respects each other disagrees out loud, flags the error before it gets expensive, and stays. The cost of care buys something real; the problem is when it turns into fear, and fear turns into silence.</li>
</ul>
<p>The practical rule that follows is short: <strong>swapping people for AI where AI cannot reach does not save money — it moves the cost into liability</strong>, which arrives later, larger, and with interest.</p>

<h3>9. What actually changes</h3>
<p>The conclusion is not to fire people. It is to <strong>move the boundary of where human effort is spent</strong>.</p>
<p>Iteration migrates to the machine: drafting, rewriting, comparing versions, redoing it a fifth time, checking consistency, translating, summarising, testing the counter-argument. What stays with the person is what was always expensive and now becomes visible: <strong>judgement, responsibility, relationship and decision</strong>.</p>
<p>And there is a side effect almost nobody anticipates, which may be the most valuable: <strong>with iteration cheap, the standard rises</strong>. You stop accepting &ldquo;good enough&rdquo; because asking again has stopped costing awkwardness. You ask for the fifth version, and the fifth version is what the client receives. The advertised gain is in cost; what remains is in quality.</p>
<p>In the end the question in the title has two answers, and the distance between them explains the whole article. With a person: three times, perhaps four, and after that the price is no longer money. With the machine: as many as you need — and the bill comes in tokens, which is the kind of bill you can settle without anyone walking away hurt.</p>

<div class="artigo-nota">
  <p><strong>In short.</strong> Coordinating people costs three things no spreadsheet shows: the social ceiling on revisions, which quietly lowers the quality of everything; the tax paid in tact, spent in management hours and, in Brazil today, in legal obligation; and human performance variance, which changes even a doctor&rsquo;s decision according to the hour of the appointment. Added to the numbers the spreadsheet does show — 70% to 100% in payroll costs above salary, 50% to 200% of annual salary to replace someone, and presenteeism that costs more than absence — that is the real price of a team. Artificial intelligence does not remove the work or replace the professional: it removes the <em>friction</em>, and with it makes cheap the iteration that used to be socially expensive. What it does not do is sign, answer, know your client or waive the law. Those who understand that boundary cut cost and raise standards at the same time; those who ignore it merely swap expense for liability.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">How to apply this in your operation</span>
  <h2>Claude AI na Prática</h2>
  <p>All 22 chapters of the series are published free on this site — including how to build workflows that absorb iteration, where to place human checking, and how a team of agents covers the functions of a small company. The book and the course go deeper into the same path. All of this material is in Portuguese.</p>
  <p class="artigo-cta-links">
    <a href="/claude/">Read the full series (free)</a>
    <a href="https://livros.villelastay.com.br/livros?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=quantas-vezes-pedir-para-refazer" target="_blank" rel="noopener">See the book</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=quantas-vezes-pedir-para-refazer" target="_blank" rel="noopener">See the online course</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p><strong>Sources.</strong> Hsiang et al., <em>JAMA Network Open</em> (2019), on appointment time and screening orders · Linder et al., <em>JAMA Internal Medicine</em> (2014), on decision fatigue and antibiotic prescribing · Gallup, on replacement cost and voluntary turnover · <em>Harvard Business Review</em>, on presenteeism · Noy and Zhang, <em>Science</em> (2023) · Brynjolfsson, Li and Raymond, <em>Generative AI at Work</em> · Brazilian Law 14.457/2022 · NR-1, Ministry of Labour Ordinance 1.419/2024, with psychosocial risk requirements enforceable since May 2026 · the Brazilian Supreme Court ruling on the labour code damages schedule.</p>
  <p>Written by <strong>Augusto Villela</strong>, lawyer (Brazilian Bar, OAB/DF 12.003) and author of the <em>Claude AI na Prática</em> series. This is an analysis of costs and method, written from the perspective of someone who hires and manages — it is not employment-law advice for a specific case, and nothing here waives legal obligations towards employees and contractors.</p>
</div>
`,
    },
    es: {
      titulo: '¿Cuántas veces puedes pedir que lo rehagan? El costo que ninguna planilla muestra | Villela Stay',
      descricao: 'El techo social de rehacer, el impuesto del tacto, la hora del día que cambia la decisión de un médico, y cuánto cuesta todo eso de verdad — con las cifras de rotación, presentismo y cargas laborales, y dónde la inteligencia artificial resuelve y dónde no.',
      h1: '¿Cuántas veces puedes pedir que lo rehagan?',
      dek: 'La tercera vez ya es incomodidad; la cuarta, riesgo. Ese techo invisible rebaja la calidad de todo lo que contratas — y es solo una parte de lo que cuesta coordinar seres humanos. Este es el cálculo completo, con lo que la IA cambia y lo que no.',
      faq: [
        { q: '¿Cuánto cuesta de verdad mantener un empleado en Brasil?', a: 'El salario es la menor parte de la cuenta. Sumando la seguridad social patronal, el fondo FGTS, las provisiones de vacaciones y aguinaldo, la multa rescisoria y los beneficios, el costo total suele quedar entre un 70% y un 100% por encima del salario bruto. Y eso es solo la nómina: fuera de ella quedan RR. HH., medicina y seguridad laboral, canal de denuncias, formación, celebraciones, bonos, premios y el tiempo de gestión — que nadie registra en ninguna parte, pero se paga en horas del jefe.' },
        { q: '¿Cuánto cuesta perder un empleado?', a: 'Según Gallup, reemplazar a alguien cuesta entre el 50% y el 200% del salario anual del puesto, según el cargo y la antigüedad — y la rotación voluntaria consume cerca de un billón de dólares al año solo en Estados Unidos. El grueso no es el reclutamiento: es la vacante abierta, los seis a doce meses hasta que el sustituto rinda igual, el conocimiento que se fue con la persona y el tiempo del jefe desviado a contratar.' },
        { q: '¿Qué es el presentismo y por qué cuesta más que la ausencia?', a: 'Presentismo es estar presente y no rendir — enfermo, agotado, preocupado, desmotivado. Estimaciones reunidas por Harvard Business Review sitúan el costo en torno a 150.000 millones de dólares al año en Estados Unidos. Por día, faltar cuesta más, porque la entrega es cero. En el agregado, el presentismo cuesta más, porque ocurre muchas más veces y nadie lo mide: no aparece en ningún informe, porque la persona fichó.' },
        { q: '¿La hora del día realmente cambia la calidad de una decisión profesional?', a: 'Cambia, y está medido en profesionales de alto nivel decidiendo cosas graves. Un estudio publicado en JAMA Network Open en 2019 mostró que los médicos de atención primaria pedían mamografía en el 63,7% de las consultas de las 8h y en el 47,8% de las de las 17h; para el cribado de cáncer colorrectal, la tasa caía del 36,5% al 23,4%. Otro estudio, en JAMA Internal Medicine en 2014, encontró un aumento de la prescripción inadecuada de antibióticos conforme avanzaba el turno. No es pereza: es fatiga de decisión, y afecta a todo el mundo.' },
        { q: '¿Cuántas veces se puede pedir que rehagan un trabajo sin ofender?', a: 'No hay un número legal, y ese es justamente el problema: el límite es social y cada uno siente el suyo. En la práctica, la primera vez es normal, la segunda se acepta con esfuerzo, la tercera ya carga incomodidad y la cuarta suele leerse como persecución — independientemente de que el trabajo esté bien o no. El efecto es que mucho se entrega y se acepta en el nivel "suficiente", no porque alguien se conformara con esa calidad, sino porque insistir salía caro en la relación.' },
        { q: '¿Entonces la inteligencia artificial sustituye al empleado?', a: 'No, y tratarla así sale caro. No firma, no responde por el error, no tiene matrícula profesional, no tiene relación con tu cliente y no sabe lo que nadie le contó. Lo que sustituye es la ITERACIÓN: la quinta versión, la revisión a las 23h, la instrucción directa sin rodeos. Quien cambia personas por IA donde la IA no alcanza no ahorra: traslada el costo al pasivo, que llega después y mayor.' },
        { q: '¿Existe evidencia real de que la IA mejora la calidad, y no solo la velocidad?', a: 'Existe, medida en experimentos. En el estudio de Noy y Zhang publicado en Science en 2023, con 453 profesionales con formación universitaria, el tiempo de las tareas cayó un 40% y la calidad evaluada por terceros subió un 18%. En el estudio de Brynjolfsson, Li y Raymond, con 5.179 agentes de soporte, la productividad subió un 14% en promedio — y un 34% entre los menos experimentados. El patrón de ambos es el mismo: la ganancia es mayor para quien sabe menos, lo que cambia la cuenta de a quién necesitas contratar.' },
      ],
      corpo: (h) => `
<p class="artigo-lead">Pide a un fotógrafo que repita la sesión. La repite. Pídeselo otra vez: la repite, con un silencio distinto. Pídeselo una tercera vez y algo cambia en la relación — aunque tengas razón, aunque estés pagando. En la cuarta, ya no estás pidiendo calidad: estás, a sus ojos, fastidiando. <strong>Existe un techo para cuántas veces se puede pedir que rehagan algo, y ese techo no tiene nada que ver con que el trabajo esté bien.</strong> Es social. Y es carísimo.</p>

${h.fig(1, { legenda: 'La misma pieza, rehecha cuantas veces haga falta — y nadie se cansa.' })}

<h2>Parte I — El costo que ninguna planilla muestra</h2>

<h3>1. El techo de rehacer</h3>
<p>Ningún contrato dice cuántas revisiones caben. Ningún código de obra establece cuántas veces se puede llamar de vuelta al pintor. El límite existe igual, y todos lo conocen por intuición: la primera vez es normal, la segunda se acepta con algún esfuerzo, la tercera carga incomodidad, la cuarta se vuelve persecución.</p>
<p>Repare en lo que eso produce, porque es sutil y es el punto del artículo. <strong>No es que se acepte el trabajo malo.</strong> Es que existe una franja ancha — entre &ldquo;bueno&rdquo; y &ldquo;excelente&rdquo; — en la que uno <em>desiste</em>. El arquitecto entregó un plano que resuelve, pero no encanta; el contador hizo lo que se pide, no lo que se podría; el abogado escribió el escrito correcto, no el mejor posible. Lo miras, piensas en pedir otra vuelta, calculas el costo social de eso, y firmas.</p>
<p>El resultado agregado de esa renuncia es invisible justamente porque nunca se registra. No hay una línea contable llamada &ldquo;calidad que dejé de exigir para no incomodar&rdquo;. Pero está en el producto final de casi todo lo que has contratado.</p>
<p>Y el efecto es de ida y vuelta, lo que lo empeora. Quien ejecuta también sabe dónde está el techo — y, sabiéndolo, calibra la entrega en el punto en que el cliente probablemente no volverá a pedir. No es deshonestidad: es economía de esfuerzo en un sistema donde exigir sale caro para los dos lados. <strong>El &ldquo;suficiente&rdquo; no es lo que la gente sabe hacer. Es el equilibrio de un juego en el que insistir tiene precio.</strong></p>

<h3>2. El impuesto del tacto</h3>
<p>Ahora el segundo costo, que el jefe paga en horas de su propia vida: decir las cosas.</p>
<p>Un error que se explicaría en una frase — &ldquo;está mal aquí, rehazlo así&rdquo; — no se dice en una frase. Se envuelve. Se empieza elogiando, se suaviza en el medio, se termina con estímulo. Se elige la hora, se elige el canal, se evita delante de los demás, se posterga al lunes porque el viernes la persona estaba mal. Existe incluso un método con nombre para esto, el <em>feedback</em> en sándwich, enseñado como técnica — lo que confirma que envolver es obligatorio.</p>
<p>Sume el tiempo. Un jefe con diez subordinados gasta, por semana, algunas horas solo en el <strong>envoltorio</strong> de aquello que necesitaba decir. No en la decisión, no en el análisis: en el envoltorio. Multiplique por un año y tendrá semanas enteras de trabajo cualificado consumidas en la tarea de comunicar sin herir.</p>
<p>Y aquí, en Brasil, el costo dejó de ser solo de tiempo. Pasó a ser jurídico y obligatorio:</p>
<ul class="artigo-lista">
  <li>La <strong>Ley 14.457/2022</strong> obliga a las empresas con comisión interna de prevención a mantener un <strong>canal de denuncias</strong> para acoso moral y sexual, con garantía de anonimato, e incluir el tema en la formación de la comisión.</li>
  <li>La <strong>NR-1 actualizada</strong> (Ordenanza del Ministerio de Trabajo 1.419/2024) incorporó los <strong>riesgos psicosociales</strong> a la gestión de riesgos laborales. Tras una prórroga de doce meses, la exigencia quedó <strong>fiscalizable desde mayo de 2026</strong> — y no distingue por tamaño de empresa: lo que varía es la complejidad de la evaluación, no la obligación de hacerla.</li>
  <li>Y está el pasivo. El acoso moral reconocido genera indemnización, y el Supremo Tribunal Federal ya decidió que el tabulador de daño moral del código laboral <strong>no es un techo</strong> — las condenas van de unos pocos miles a cientos de miles de reales, según la gravedad y la capacidad económica del demandado.</li>
</ul>
<p>Nada de esto es injusto. Exigir respeto en el ambiente de trabajo es civilización, y quien vivió con un jefe que gritaba sabe de qué protege la ley. Pero hay que ser honesto sobre la aritmética: <strong>el derecho a no ser maltratado tiene un precio operativo, y ese precio se paga en rodeos, en tiempo y en calidad no exigida.</strong></p>

<h3>3. Lo que el cansancio hace con la decisión</h3>
<p>Queda la cuestión del empleado enfermo, de mal humor, al final de la jornada o en vísperas de vacaciones. Tiene respuesta medida — y la respuesta es más grave de lo que sugiere la intuición, porque fue medida en <strong>médicos</strong>, decidiendo sobre <strong>cáncer</strong>.</p>
<p>Un estudio publicado en <em>JAMA Network Open</em> en 2019 siguió los pedidos de cribado en atención primaria según el horario de la consulta:</p>
<div class="artigo-nota">
  <p><strong>Mamografía:</strong> pedida en el <strong>63,7%</strong> de las consultas de las 8h — y en el <strong>47,8%</strong> de las de las 17h.<br>
  <strong>Cribado de cáncer colorrectal:</strong> <strong>36,5%</strong> a las 8h — y <strong>23,4%</strong> a las 17h.</p>
</div>
<p>Misma enfermedad. Mismo médico. Misma paciente elegible. La diferencia es el reloj. Un estudio anterior, en <em>JAMA Internal Medicine</em> en 2014, halló el espejo de esto: la prescripción <em>inadecuada</em> de antibiótico para infección respiratoria <strong>aumentaba</strong> conforme avanzaba la sesión — cuando uno se cansa, es más fácil ceder que explicar por qué no.</p>
<p>Se llama fatiga de decisión, y lo esencial es que <strong>no es un fallo de carácter</strong>. No es pereza, no es mala voluntad, no se resuelve con bonos ni con charlas motivacionales. Es biología, y alcanza al profesional más dedicado de tu equipo exactamente como alcanza al más descuidado. Lo que contratas no es una capacidad constante: es una curva que sube, baja, cae el viernes, desaparece en vísperas de vacaciones y vuelve despacio después.</p>

<h2>Parte II — La planilla abierta</h2>
<p>Hecha la parte que se siente, vamos a la que se suma: cuánto cuesta mantener, cuánto cuesta agradar, cuánto cuesta perder. Las cifras existen.</p>

<h3>4. Lo que cuesta mantener</h3>
<p>En Brasil, el salario bruto es la menor parte de la cuenta. Seguridad social patronal (en torno al 28,8% para las empresas de los regímenes principales), FGTS del 8%, provisión de vacaciones con su tercio constitucional (11,11%), provisión de aguinaldo (8,33%), provisión de multa rescisoria — sumados a beneficios como transporte, alimentación y seguro médico, el <strong>costo total suele quedar entre un 70% y un 100% por encima del salario bruto</strong>.</p>
<p>Y eso es solo la nómina. Fuera de ella, sin entrar en ninguna planilla de costo por empleado, quedan:</p>
<ul class="artigo-lista">
  <li><strong>RR. HH.</strong> — reclutamiento, selección, integración, evaluación, clima, desvinculación.</li>
  <li><strong>Cumplimiento y jurídico laboral</strong> — política interna, canal de denuncias, formación obligatoria, defensa en demandas.</li>
  <li><strong>Salud y seguridad</strong> — exámenes, programas de gestión de riesgos y, desde 2026, el mapeo de riesgos psicosociales.</li>
  <li><strong>Compromiso</strong> — celebraciones, premios, obsequios, campañas internas, encuestas de clima, beneficios flexibles.</li>
  <li><strong>Tiempo de gestión</strong> — la línea más cara y la única que nunca se registra: las horas del jefe gastadas en conversar, mediar, motivar, corregir con cuidado y reformular el pedido de otra manera.</li>
</ul>

<h3>5. Lo que cuesta perder</h3>
<p>Según Gallup, reemplazar a un empleado cuesta <strong>entre el 50% y el 200% del salario anual</strong> del puesto, según el cargo y la antigüedad — y la rotación voluntaria consume, solo en Estados Unidos, algo cercano a <strong>un billón de dólares al año</strong>.</p>
<p>El error común es imaginar que ese es el costo del anuncio de la vacante. No lo es. Es la vacante abierta produciendo cero, el sustituto tardando de seis a doce meses en rendir como el anterior, el conocimiento acumulado saliendo por la puerta, el resto del equipo absorbiendo la sobrecarga — y, con frecuencia, renunciando a continuación.</p>

<h3>6. Lo que cuesta estar presente sin rendir</h3>
<p>Aquí está la cifra más subestimada de la gestión. El <strong>absentismo</strong> — la falta — lo mide todo el mundo, porque se ve. El <strong>presentismo</strong> — estar ahí sin rendir — no lo mide casi nadie, porque la persona fichó.</p>
<p>Estimaciones reunidas por <em>Harvard Business Review</em> sitúan el costo del presentismo en torno a <strong>150.000 millones de dólares al año</strong> en Estados Unidos. Por día, faltar cuesta más, porque la entrega es cero. En el agregado, el presentismo cuesta más — porque ocurre muchas más veces, y porque nadie lo ve para corregirlo.</p>
<p>Y note la trampa: las políticas hechas para reducir la falta (presión por presencia, descuento, control) tienden a <strong>aumentar</strong> el presentismo. Cambias un costo visible por uno invisible y mayor, y celebras el indicador.</p>

<h2>Parte III — Dónde entra la inteligencia artificial</h2>

<h3>7. Lo que de hecho elimina</h3>
<p>La observación central merece decirse con precisión: <strong>la IA no elimina el trabajo. Elimina la fricción social del trabajo.</strong></p>
<ul class="artigo-lista">
  <li><strong>Rehacer deja de tener techo.</strong> La quinta versión cuesta lo mismo que la primera: tokens. No cuesta incomodidad, no cuesta relación, no genera resentimiento en el sexto intento. Por primera vez, el número de iteraciones lo decide la <em>calidad deseada</em>, y no el límite de lo que se puede pedir.</li>
  <li><strong>La instrucción vuelve a ser directa.</strong> &ldquo;Esto está mal, rehazlo así&rdquo; es una frase entera y suficiente. Sin preámbulo, sin sándwich, sin elegir la hora. El tiempo del rodeo vuelve al bolsillo.</li>
  <li><strong>No hay hora del día.</strong> No hay víspera de vacaciones, regreso de vacaciones, lunes, viernes a las 17h, dolor de cabeza, discusión en casa ni fatiga de decisión. La curva de desempeño es plana — lo que, tras las cifras de la sección 3, deja de ser un detalle y se vuelve diferencia de calidad.</li>
  <li><strong>No hay techo de disponibilidad.</strong> A las 23h de un domingo el costo marginal es el mismo que a las 10h de un martes.</li>
</ul>
<p>Y la ganancia no es promesa: fue medida en experimentos controlados. En el estudio de <strong>Noy y Zhang</strong>, publicado en <em>Science</em> en 2023 con 453 profesionales con formación universitaria, el tiempo de las tareas cayó un <strong>40%</strong> y la calidad evaluada por terceros subió un <strong>18%</strong> — las dos cosas a la vez, que es justamente lo que rara vez ocurre. En el estudio de <strong>Brynjolfsson, Li y Raymond</strong>, con <strong>5.179</strong> agentes de soporte, la productividad subió un <strong>14%</strong> en promedio y un <strong>34%</strong> entre los menos experimentados.</p>
<p>Guarde ese último recorte, porque es lo que cambia la cuenta del empresario: <strong>la ganancia es mayor para quien sabe menos</strong>. No es que la IA prescinda del profesional excelente — casi no mueve su aguja. Es que acerca al principiante al estándar del experimentado, y eso altera a quién necesitas contratar para entregar un nivel determinado.</p>
<p>Las dependencias son reales: internet disponible, máquina funcionando, cuenta al día, créditos disponibles. La ironía merece señalarse: son exactamente las mismas condiciones cuya falta también retrasaría al empleado. La diferencia es que estas fallan de vez en cuando, y la condición humana falla todos los días un poco.</p>

<h3>8. Dónde no entra — y esta parte no es una salvedad de cortesía</h3>
<p>Un artículo que se detuviera en la sección anterior estaría vendiendo una ilusión cara. La frontera importa más que la promesa:</p>
<ul class="artigo-lista">
  <li><strong>No firma y no responde.</strong> No tiene matrícula de abogado, ingeniero, médico ni contador; no es demandada, no indemniza, no pierde el registro. En todo lo que exige responsabilidad profesional, el nombre en el documento sigue siendo el de una persona — y quien firma debe poder verificar lo que firma.</li>
  <li><strong>No tiene relación con tu cliente.</strong> La confianza construida en quince años no es un servicio que se contrate por token.</li>
  <li><strong>No sabe lo que nadie le contó.</strong> La mitad del buen trabajo de un profesional veterano viene del contexto tácito: lo que el jefe no dijo, lo que aquel cliente detesta, lo que salió mal la última vez. Eso no está en el pedido.</li>
  <li><strong>Se equivoca de un modo más difícil de detectar.</strong> Se equivoca con confianza, en formato plausible, incluso inventando fuentes. Quien revisa necesita entender del asunto — y por eso eleva a quien sabe, pero no salva a quien no sabe.</li>
  <li><strong>RR. HH. y cumplimiento no son desperdicio.</strong> La NR-1 y la Ley 14.457/2022 existen por razones que cualquiera que haya trabajado bajo un jefe abusivo reconoce. El argumento de este texto es que ese costo se <em>cuente</em>, no que se elimine — y ninguna herramienta dispensa una obligación legal.</li>
  <li><strong>El tacto también produce algo bueno.</strong> Un equipo que se respeta discrepa en voz alta, avisa del error antes de que salga caro, y se queda. El costo del cuidado compra algo real; el problema es cuando se vuelve miedo, y el miedo se vuelve silencio.</li>
</ul>
<p>La regla práctica que sale de ahí es corta: <strong>cambiar personas por IA donde la IA no alcanza no ahorra — traslada el costo al pasivo</strong>, que llega después, mayor y con intereses.</p>

<h3>9. Lo que cambia de verdad</h3>
<p>La conclusión no es despedir. Es <strong>mover la frontera de dónde se gasta el esfuerzo humano</strong>.</p>
<p>La iteración migra a la máquina: bosquejar, reescribir, comparar versiones, rehacer la quinta vez, verificar consistencia, traducir, resumir, probar el argumento contrario. Lo que queda con la persona es lo que siempre fue caro y ahora se vuelve visible: <strong>juicio, responsabilidad, relación y decisión</strong>.</p>
<p>Y hay un efecto colateral que casi nadie anticipa, y que quizá sea el más valioso: <strong>con la iteración barata, el estándar sube</strong>. Dejas de aceptar el &ldquo;suficiente&rdquo; porque pedir de nuevo dejó de costar incomodidad. Pides la quinta versión, y la quinta versión es la que el cliente recibe. La ganancia que se anuncia es de costo; la que queda es de calidad.</p>
<p>Al final, la pregunta del título tiene dos respuestas, y es la distancia entre ellas lo que explica el artículo entero. Con una persona: tres veces, quizá cuatro, y después el precio ya no es en dinero. Con la máquina: cuantas necesites — y la cuenta llega en tokens, que es el tipo de cuenta que se paga sin que nadie salga dolido.</p>

<div class="artigo-nota">
  <p><strong>Síntesis.</strong> Coordinar personas cuesta tres cosas que ninguna planilla muestra: el techo social de rehacer, que rebaja silenciosamente la calidad de todo; el impuesto del tacto, pagado en horas de gestión y, hoy en Brasil, en obligación legal; y la variación humana de desempeño, que cambia hasta la decisión de un médico según la hora de la consulta. Sumados a las cifras que la planilla sí muestra — del 70% al 100% de cargas sobre el salario, del 50% al 200% del salario anual para reemplazar a alguien, y un presentismo que cuesta más que la ausencia —, ese es el precio real de un equipo. La inteligencia artificial no elimina el trabajo ni sustituye al profesional: elimina la <em>fricción</em>, y con ello abarata la iteración que antes era socialmente cara. Lo que no hace es firmar, responder, conocer a tu cliente ni dispensar la ley. Quien entiende esa frontera reduce costo y sube estándar a la vez; quien la ignora solo cambia gasto por pasivo.</p>
</div>

<div class="artigo-cta">
  <span class="artigo-cta-tag">Cómo aplicarlo en tu operación</span>
  <h2>Claude AI na Prática</h2>
  <p>Los 22 capítulos de la serie están publicados gratis en este sitio — incluyendo cómo montar flujos que absorben la iteración, dónde poner la verificación humana y cómo un equipo de agentes cubre las funciones de una empresa pequeña. El libro y el curso profundizan el mismo camino. Todo este material está en portugués.</p>
  <p class="artigo-cta-links">
    <a href="/claude/">Leer la serie completa (gratis)</a>
    <a href="https://livros.villelastay.com.br/livros?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=quantas-vezes-pedir-para-refazer" target="_blank" rel="noopener">Conocer el libro</a>
    <a href="https://academia.villelastay.com.br/academy/marketplace?utm_source=villelastay&amp;utm_medium=blog&amp;utm_campaign=quantas-vezes-pedir-para-refazer" target="_blank" rel="noopener">Ver el curso en línea</a>
  </p>
</div>

<div class="tea-aviso tea-aviso-fim">
  <p><strong>Fuentes.</strong> Hsiang et al., <em>JAMA Network Open</em> (2019), sobre horario de consulta y pedido de cribado · Linder et al., <em>JAMA Internal Medicine</em> (2014), sobre fatiga de decisión y prescripción de antibióticos · Gallup, sobre costo de reemplazo y rotación voluntaria · <em>Harvard Business Review</em>, sobre presentismo · Noy y Zhang, <em>Science</em> (2023) · Brynjolfsson, Li y Raymond, <em>Generative AI at Work</em> · Ley brasileña 14.457/2022 · NR-1, Ordenanza del Ministerio de Trabajo 1.419/2024, con exigencia de riesgos psicosociales fiscalizable desde mayo de 2026 · decisión del Supremo Tribunal Federal sobre el tabulador de daño moral del código laboral.</p>
  <p>Texto de <strong>Augusto Villela</strong>, abogado (OAB/DF 12.003) y autor de la serie <em>Claude AI na Prática</em>. Es un análisis de costos y de método, escrito desde la perspectiva de quien contrata y gestiona — no es orientación laboral para un caso concreto, y nada aquí dispensa el cumplimiento de las obligaciones legales con empleados y prestadores.</p>
</div>
`,
    },
  },
};
