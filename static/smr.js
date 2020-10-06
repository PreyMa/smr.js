(function() {

  function forEachChild( e, fn, idx= 0 ) {
  	if( !(e instanceof HTMLElement) ) {
    	return;
    }

  	const cs= e.children;
    for( let i= idx; i!= cs.length; i++ ) {
      const c= cs.item( i );
      fn( c, i, cs );
    }
  }

  // Setup defaults
  let config= Object.assign({
    docLoaded: function( c ) { document.addEventListener('DOMContentLoaded', c); },
    rootElement: document
  }, window.smrConfig || {} );
  window.smrConfig= config;

  config.docLoaded( function() {
    // For each meth instance
    const maths= config.rootElement.querySelectorAll('m-math');
    maths.forEach( m => {

      // Find all open parenthesis and sum elements
      const openPars= m.querySelectorAll('m-par[open], m-sum');
      openPars.forEach( e => {
      	const isSum= e.tagName.toLowerCase() === 'm-sum';
      	const parent= e.parentNode;

        const style= window.getComputedStyle( parent );

        // Get id of closing parenthesis sibling
        const id= e.getAttribute('open');
        const sibling= id ? parent.querySelector(`m-par[close="${id}"]`) : null;

        // Check all sibling elements inbetween the paranthesis
        let cur= e, minTop= Number.POSITIVE_INFINITY, maxBottom= 0;
        while( cur= cur.nextSibling ) {
        	if( cur === sibling ) {
          	break;
          }

          let top= minTop, bottom= maxBottom, c;
          if( cur.tagName ) {
          	switch( cur.tagName.toLowerCase() ) {
            	case 'm-var':
              case 'm-op':
              case 'm-nm':
              case 'm-sub': // ?
              case 'm-sup':
              case 'm-lbnd':
              case 'm-ubnd':
              case 'm-num':
              case 'm-denom': // ?
              	d= cur.firstElementChild;
                top= d.offsetTop;
                bottom= d.offsetTop+ d.clientHeight;
              	break;

              case 'm-par':
              case 'm-sum':
              	top= cur.offsetTop;
                bottom= cur.offsetTop+ cur.clientHeight;
              	break;

              default:
                break;
            }

            // Find highest and lowest points
            maxBottom= Math.max(maxBottom, bottom);
            minTop= Math.min(minTop, top);
          }
        }

        // Reset minTop if the loop did not run at least once
        if( !e.nextSibling ) {
          minTop= 0;
        }

        const fontSize= parseFloat(style.fontSize.slice(0, -2))
        const size= maxBottom- minTop;

        function s(q) {
          return q ? q.firstElementChild.style : {};
        }

        // Set element style
        if( isSum ) {
        	const fs= Math.floor( size* 0.7 );
        	s(e).fontSize= `${fs}px`;
          s(e).marginTop= `${minTop}px`;

        } else {
          const scale= size/fontSize;
          s(e).transform= s(sibling).transform= `scale(1, ${scale})`;
          s(e).marginTop= s(sibling).marginTop= `${minTop}px`;
        }
      });
    });
  });
})();
