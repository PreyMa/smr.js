(function() {
  "use strict";

  function getTagName( elem ) {
    return elem && elem.tagName ? elem.tagName.toLowerCase() : null;
  }

  function getStemChild( e ) {
    let depth= 0;
    while( getTagName( e ) === 'm-rtstem' ) {
      depth++;
      e= e.firstElementChild;
    }

    return { child: e, depth };
  }

  function getNthStem( e, depth ) {
    while( getTagName( e ) === 'm-rtstem' && depth > 0 ) {
      depth--;
      e= e.firstElementChild;
    }

    return e;
  }

  function parseStyle( elem, name ) {
    const str= elem.style[name];
    return parseFloat(str.slice(0, -2));
  }

  function getStyleFontSize( elem ) {
    const style= window.getComputedStyle( elem );
    return parseFloat(style.fontSize.slice(0, -2));
  }

  // Setup defaults
  let config= Object.assign({
    docLoaded: function( c ) { document.addEventListener('DOMContentLoaded', c); },
    rootElement: document
  }, window.smrConfig || {} );
  window.smrConfig= config;

  config.docLoaded( function() {
    // For each math instance
    const maths= config.rootElement.querySelectorAll('m-math');
    maths.forEach( m => {

      // Find all root stem starts
      let rootStemMargin= 0;
      const stemStarts= m.querySelectorAll('m-rtstem[start]');

      // Detect the top margin of root stems
      if( stemStarts.length ) {
        const style= window.getComputedStyle( stemStarts[0] );
        rootStemMargin= parseFloat(style.marginTop.slice(0, -2));
      }

      // Iterate all root stems
      stemStarts.forEach( e => {
        if( getTagName( e.parentNode ) !== 'm-expr' ) {
          e= e.parentNode;
        }
        const parent= e.parentNode;

        // Get first root symbol element and add it to the array
        let rootArr= [];
        let rootElem= e;
        while( rootElem && (getTagName(rootElem) !== 'm-rt')) {
          rootElem= rootElem.previousSibling;
        }

        if( rootElem ) {
          rootArr.push({rootElem, depth: 0});
          
          // Include the root symbol in the minTop calculation
          e= rootElem;
        }

        // Iterate over all elements until the end of the stem is reached
        let stemArr= [];
        let cur= e, minTop= Number.POSITIVE_INFINITY, curRootDepth= 0, maxRootDepth= 0;
        iterateStems: while( cur ) {
          switch( getTagName( cur ) ) {
            case 'm-rt':
                rootArr.push({rootElem: cur, depth: curRootDepth});
                // Fall through!

            case 'm-var':
            case 'm-op':
            case 'm-nm':
            case 'm-sub': // ?
            case 'm-lbnd':
            case 'm-denom': // ?
              minTop= Math.min(minTop, cur.firstElementChild.offsetTop);
              break;

            case 'm-spacer':
              // Only check upper spacers
              if( cur.getAttribute('r') === '1' ) {
                // Check if it has a stem
                const child= cur.firstElementChild;
                if( getTagName( child ) === 'm-rtstem' ) {
                  // Count stem children
                  const {depth}= getStemChild( child );
                  curRootDepth= depth;

                  stemArr.push({e: cur, spacer: true});

                } else {
                  // End loop
                  break iterateStems;
                }
              }
              break;

            case 'm-rtstem':
              // Count stem children
              const {child, depth}= getStemChild( cur );
              curRootDepth= depth;

              // Ignore position of sum and parenthesis elements
              const childTag= getTagName( child );
              if( childTag !== 'm-par' && childTag !== 'm-sum' ) {
                minTop= Math.min(minTop, child.firstElementChild.offsetTop);
              }
              stemArr.push({e: cur, spacer: false});
              break;

            case 'm-sup':
            case 'm-ubnd':
            case 'm-num':
            case 'm-par':
            case 'm-sum':
              // End loop
              break iterateStems;

            default:
              break;
          }

          maxRootDepth= Math.max(maxRootDepth, curRootDepth);
          cur= cur.nextSibling;
        }

        // Set margin of all stem elements
        const offset= minTop- maxRootDepth * rootStemMargin;
        stemArr.forEach( stem => {
          stem.e.style.marginTop= (stem.spacer ? offset : offset+ rootStemMargin)+ 'px';
        });

        // Scale all root symbol elements
        rootArr.forEach( rt => {
          const elem= rt.rootElem.firstElementChild;
          const fontSize= getStyleFontSize( elem );
          const top= elem.offsetTop;
          const diff= top- minTop;
          const margins= maxRootDepth- rt.depth- 1;
          const scaleY= (fontSize+ diff+ margins*rootStemMargin) / fontSize;
          const scaleX= Math.max(1, scaleY* 0.8);
          elem.style.transform= `scale(${scaleX}, ${scaleY})`;
        });
      });

      // Find all open parenthesis and sum elements
      const openPars= m.querySelectorAll('m-par[open], m-sum');
      openPars.forEach( e => {
      	const isSum= getTagName( e ) === 'm-sum';

        // Find parent expression if element is wrapped by stem
        let parent= e, cur= e, rootDepth= -1;
        while( getTagName(parent) !== 'm-expr' ) {
          rootDepth++;
          cur= parent;
          parent= parent.parentNode;
          if( !parent ) {
            console.error('Cannot find parent expression of parenthesis:', e);
            return;
          }
        }

        // Get id of closing parenthesis sibling
        const id= e.getAttribute('open');
        const sibling= id ? parent.querySelector(`m-par[close="${id}"]`) : null;

        // Check all sibling elements inbetween the paranthesis
        let minTop= Number.POSITIVE_INFINITY, maxBottom= 0;
        while( cur= cur.nextSibling ) {

          // Unwrap elements inside root stems
          // Sibling might also be wrapped
          const {child: inner, depth: innerDepth}= getStemChild( cur );
        	if( inner === sibling ) {
          	break;
          }

          let top= minTop, bottom= maxBottom;
          function calcTopBottom( cur ) {
            let d;
            switch( getTagName( cur ) ) {
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

              case 'm-spacer':
                // Only consider top spacers
                if( cur.getAttribute('r') === '1' ) {
                  // Set top offset if the root level is equal or greater
                  d= getNthStem( cur.firstElementChild, rootDepth );
                  if( d ) {
                    top= d.offsetTop;
                  }
                }
                break;


              case 'm-rtstem':
                // Get element at root depth and
                d= getNthStem( cur, rootDepth );
                if( d !== cur ) {
                  // Don't recur if another stem element is found
                  if( getTagName(d) === 'm-rtstem' ) {
                    top= d.offsetTop;

                  } else {
                    calcTopBottom( d );
                  }
                }
                break;

              default:
                break;
            }
          }

          // Evaluate element
          calcTopBottom( cur );

          // Find highest and lowest points
          maxBottom= Math.max(maxBottom, bottom);
          minTop= Math.min(minTop, top);
        }

        // Reset minTop if the loop did not run at least once
        if( !e.nextSibling ) {
          minTop= e.offsetTop;
        }

        // Get font size of the parent expression
        const fontSize= getStyleFontSize( parent );
        const size= maxBottom- minTop;

        // There might be a root stem that creates a top offset
        const marginOffset= minTop- e.offsetTop;

        function s(q) {
          return q ? q.firstElementChild.style : {};
        }

        // Set element style
        if( isSum ) {
        	const fs= Math.floor( size* 0.7 );
        	s(e).fontSize= `${fs}px`;
          s(e).marginTop= `${marginOffset}px`;

        } else {
          const scaleY= size/fontSize;
          const scaleX= Math.min(1.1, Math.max(0.7, scaleY / 1.3));
          s(e).transform= s(sibling).transform= `scale(${scaleX}, ${scaleY})`;
          s(e).marginTop= s(sibling).marginTop= `${marginOffset}px`;
        }
      });
    });
  });
})();
