import React from 'react';
import Logger from './logger';

export default function App() {
  Logger.warn('yoa');
  return (
    <div className='App'>
      <h1>Hello CodeSandbox</h1>
      <h2>Start editing to see some magic happen!</h2>
    </div>
  );
}