-- Seed the "Estado de cartas" static page (card-condition guide). Rendered
-- at /info/estado-de-cartas. Content migrated from the OpenCart info page
-- with all inline styles, <font> tags, and dark-reader artifacts stripped.
-- Title is rendered by the page component, so the body starts at h2.

insert into public.static_pages (slug, title, content, sort_order)
values (
  'estado-de-cartas',
  'Estado de cartas',
  $content$<h2>Near Mint (NM)</h2>
<p>Una carta Near Mint (NM) tiene el aspecto de no haber sido jugada sin sleeves. Puede tener marcas mínimas, pero por lo general no presenta deterioros. El borde de una carta en este estado puede tener marcas blancas, pero deben ser pocas y muy pequeñas. Cuando se observa la carta a la luz del día, la superficie debe ser en general limpia. Puede tener unas marcas menores, pero el aspecto general casi no tiene defectos o fallas importantes.</p>
<p>La gama aceptable de cartas dentro del estado Near Mint incluye cartas sin imperfecciones y cartas con algunas imperfecciones menores.</p>

<hr>

<h2>Light Played (LP)</h2>
<p>Una carta Light Played (LP) puede tener desde un desgaste menor en los bordes o esquinas hasta leves raspaduras en la superficie. No hay defectos importantes como daños por líquidos, dobleces o problemas con la integridad estructural de la carta.</p>
<p>Las imperfecciones notables están bien, pero ninguna debe de ser demasiado severa o tener un volumen demasiado alto.</p>

<hr>

<h2>Moderately Played (MP)</h2>
<p>Las cartas en condición Moderately Played (MP) pueden tener desgaste en los bordes o esquinas, raspaduras, arrugas, pequeñas manchas, blanqueamiento o cualquier combinación de ejemplos leves de estas marcas.</p>

<hr>

<h2>Heavily Played (HP)</h2>
<p>Una carta Heavily Played (HP) tiene un aspecto muy deteriorado como el que se puede conseguir en una carta con un uso habitual sin sleeves.</p>
<p>Una carta en este estado tiene un aspecto malo, y a partir de este estado se empieza a dudar de si la carta puede ser aceptada para jugar un torneo con ella aun usando sleeves. Sin embargo, la carta no ha sido alterada (bordes tintados, garabatos, etc.).</p>

<hr>

<h2>Damaged (DM)</h2>
<p>Las cartas en condición Damaged (DM) muestran un desgaste severo.</p>
<p>Pueden presentar roturas, dobleces o arrugas que pueden hacer que la carta sea ilegal para jugar un torneo. Las cartas en este estado pueden tener un desgaste extremo en los bordes, un desgaste extremo en las esquinas, raspaduras fuertes, dobleces o arrugas u otros daños que afecten directamente la integridad estructural de la carta.</p>

<figure>
  <img src="https://poke-singles.com/image/catalog/Logo-Borde-400x400.png" alt="Poke Singles">
</figure>$content$,
  20
)
on conflict (slug) do nothing;
