import React from 'react'

export default function Tooltip({ children, text, ...rest }: {children: React.ReactNode, text: string}) {
  const [show, setShow] = React.useState(false);

  return (
    <div className="absolute w-full h-full" style={show ? { overflow: 'visible'} : { overflow: 'hidden'} } onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="fixed w-fit z-10 bg-[rgba(0,0,0,0.9)] text-white p-[5px] rounded-[5px]" style={show ? { visibility: "visible" } : { visibility: 'hidden'}}>
        {text}
        <span className="absolute bottom-full left-[calc(50%-5px)] border-[5px] border-[rgba(0,0,0,0.9)] border-x-[transparent] border-t-[transparent]" />
      </div>
      <div
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}
