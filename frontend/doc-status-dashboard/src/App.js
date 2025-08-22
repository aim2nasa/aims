import React from "react";
import ApiTest from "./components/ApiTest";

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Document Status Dashboard
          </h1>
          <p className="text-gray-600 mb-4">
            React + Tailwind CSS가 정상적으로 작동 중입니다!
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <h3 className="font-semibold text-blue-600">연결 테스트</h3>
              <p className="text-sm text-gray-500">API 서버 연결을 확인하세요</p>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-green-600">스타일 테스트</h3>
              <p className="text-sm text-gray-500">Tailwind CSS가 작동합니다</p>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-purple-600">준비 완료</h3>
              <p className="text-sm text-gray-500">컴포넌트를 추가할 준비가 되었습니다</p>
            </div>
          </div>
          <div className="mt-6">
            <button className="btn-primary mr-3">
              Primary Button
            </button>
            <button className="btn-secondary">
              Secondary Button
            </button>
          </div>
        </div>
        
        <ApiTest />
      </div>
    </div>
  );
}

export default App;