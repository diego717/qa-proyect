# Búsqueda, filtros y listados

### 1. Una búsqueda sin resultados ayuda a seguir
- **Qué mirar:** buscar algo que no existe. ¿Dice que no hay resultados y sugiere qué hacer (revisar la ortografía, quitar filtros, ver todo)?
- **Por qué importa:** una pantalla vacía sin explicación parece un error y el usuario abandona.
- **Fuente:** [Nielsen Norman Group: Search No Results](https://www.nngroup.com/articles/search-no-results-serp/)

### 2. La búsqueda tolera tildes y mayúsculas
- **Qué mirar:** buscar el mismo término con y sin tilde ("camión" y "camion") y en mayúsculas. ¿Da los mismos resultados?
- **Por qué importa:** en español mucha gente escribe sin tildes en el celular. Si la búsqueda no los encuentra, cree que el producto no existe.
- **Fuente:** [W3C: Character Model for the Web: String Matching](https://www.w3.org/TR/charmod-norm/)

### 3. Los filtros aplicados se ven y se pueden quitar
- **Qué mirar:** aplicar dos filtros. ¿Se ve cuáles están activos y se puede quitar uno sin perder el otro?
- **Por qué importa:** con filtros invisibles, el usuario cree que no hay resultados cuando en realidad los está ocultando él.
- **Fuente:** [Nielsen Norman Group: Applying Filters](https://www.nngroup.com/articles/applying-filters/)

### 4. Atrás y compartir mantienen la búsqueda
- **Qué mirar:** buscar, filtrar, abrir un resultado y volver con "atrás". ¿Vuelve a la misma búsqueda? ¿La URL incluye la búsqueda, para poder compartirla?
- **Por qué importa:** perder la búsqueda al volver obliga a empezar de nuevo cada vez que se mira un resultado.
- **Fuente:** [MDN: History API](https://developer.mozilla.org/es/docs/Web/API/History_API)

### 5. La paginación no repite ni saltea elementos
- **Qué mirar:** en un listado paginado, comparar el último elemento de una página con el primero de la siguiente, con el orden por defecto y con otro orden.
- **Por qué importa:** un elemento que se repite o desaparece entre páginas hace que el usuario no encuentre lo que busca. Suele ser un bug de orden en la consulta.
- **Fuente:** [Nielsen Norman Group: 10 heurísticas de usabilidad](https://www.nngroup.com/articles/ten-usability-heuristics/)
