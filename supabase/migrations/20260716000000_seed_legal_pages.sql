-- Seed the two legal pages required by Google's OAuth consent-screen branding:
-- Términos de servicio (/info/terminos-de-servicio) and Política de privacidad
-- (/info/politica-de-privacidad). Minimal standard content — editable afterwards
-- in /admin/pages. Title is rendered by the page component, so bodies start at h2.

insert into public.static_pages (slug, title, content, meta_description, sort_order)
values (
  'terminos-de-servicio',
  'Términos de servicio',
  $content$<h2>Sobre Poke-Singles</h2>
<p>Poke-Singles es una tienda en línea de cartas sueltas (singles) del juego de cartas coleccionables Pokémon, con operación en Costa Rica. Al usar este sitio y realizar un pedido, usted acepta estos términos de servicio.</p>

<hr>

<h2>Cuenta de usuario</h2>
<p>Puede crear una cuenta con su correo electrónico o iniciando sesión con Google. Usted es responsable de la actividad realizada desde su cuenta y de mantener sus datos de contacto y dirección de envío actualizados.</p>

<hr>

<h2>Productos y precios</h2>
<p>Los precios se muestran en colones costarricenses (₡) y pueden cambiar sin previo aviso. Vendemos cartas sueltas, en su mayoría unidades únicas, por lo que el inventario es limitado. El estado de cada carta se describe según nuestra guía de <a href="/info/estado-de-cartas">estado de cartas</a> (NM, LP, MP, HP, DM).</p>

<hr>

<h2>Pedidos y pago</h2>
<p>Un pedido se confirma una vez verificado el pago (SINPE Móvil o transferencia bancaria). Los pedidos sin pago verificado dentro de un plazo razonable pueden ser cancelados y las cartas devueltas al inventario.</p>

<hr>

<h2>Envíos y reclamos</h2>
<p>Realizamos envíos dentro de Costa Rica, principalmente por Correos de Costa Rica. Si al recibir su pedido considera que el estado de una carta no corresponde con lo descrito, contáctenos dentro de un plazo razonable después de la entrega para revisar el caso.</p>

<hr>

<h2>Rifas y puntos de lealtad</h2>
<p>Las rifas y el programa de puntos de lealtad se rigen por las condiciones publicadas en el sitio al momento de participar y pueden ser modificados o descontinuados en cualquier momento.</p>

<hr>

<h2>Cambios y contacto</h2>
<p>Podemos actualizar estos términos ocasionalmente; la versión publicada en esta página es la vigente. Para cualquier consulta, contáctenos por los medios indicados en el sitio.</p>$content$,
  'Términos de servicio de Poke-Singles: cuentas, pedidos, pagos, envíos y rifas de la tienda de cartas Pokémon en Costa Rica.',
  30
)
on conflict (slug) do nothing;

insert into public.static_pages (slug, title, content, meta_description, sort_order)
values (
  'politica-de-privacidad',
  'Política de privacidad',
  $content$<h2>Qué datos recopilamos</h2>
<p>Al crear una cuenta o realizar un pedido recopilamos su nombre, correo electrónico, número de teléfono y dirección de envío. Si inicia sesión con Google, recibimos de su cuenta de Google su nombre, correo electrónico y foto de perfil; no accedemos a ningún otro dato de su cuenta.</p>

<hr>

<h2>Para qué usamos sus datos</h2>
<p>Usamos sus datos únicamente para gestionar su cuenta, procesar sus pedidos y envíos, administrar sus puntos de lealtad y participación en rifas, y comunicarnos con usted sobre sus pedidos.</p>

<hr>

<h2>Con quién los compartimos</h2>
<p>No vendemos sus datos personales. Solo los compartimos con terceros cuando es necesario para operar la tienda (por ejemplo, con el servicio de mensajería para entregar su pedido) o cuando la ley lo exija.</p>

<hr>

<h2>Almacenamiento y cookies</h2>
<p>Sus datos se almacenan de forma segura en nuestra plataforma. El sitio usa cookies y almacenamiento local únicamente para mantener su sesión iniciada y conservar su carrito de compras; no usamos cookies de publicidad de terceros.</p>

<hr>

<h2>Sus derechos</h2>
<p>Puede solicitar en cualquier momento el acceso, la corrección o la eliminación de sus datos personales escribiéndonos por los medios de contacto indicados en el sitio.</p>

<hr>

<h2>Cambios a esta política</h2>
<p>Podemos actualizar esta política ocasionalmente; la versión publicada en esta página es la vigente. Última actualización: julio de 2026.</p>$content$,
  'Política de privacidad de Poke-Singles: qué datos recopilamos (incluido el inicio de sesión con Google), cómo los usamos y sus derechos.',
  40
)
on conflict (slug) do nothing;
