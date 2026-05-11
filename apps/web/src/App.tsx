import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ModelList } from './model-list/ModelList.js';
import { NewRoute } from './routes/NewRoute.js';
import { EditorRoute } from './routes/EditorRoute.js';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ModelList />} />
        <Route path="/new" element={<NewRoute />} />
        <Route path="/m/:id" element={<EditorRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
