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
};
